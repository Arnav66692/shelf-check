import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModel

import render

BACKBONE = "facebook/dinov2-small"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
TEST_SHARE = 0.2
QUERIES_PER_PRODUCT = 3
QUERY_SEED = 20261121
BATCH = 48
LEARNING_RATE = 2e-5
TEMPERATURE = 0.05
MAX_TRAIN_SECONDS = 90 * 60
MAX_EPOCHS = 12
WORKERS = 4


def to_tensor(image: Image.Image) -> torch.Tensor:
    pixels = (np.asarray(image, np.float32) / 255 - MEAN) / STD
    return torch.from_numpy(pixels.transpose(2, 0, 1))


def is_test(set_id: str) -> bool:
    return int(hashlib.sha256(set_id.encode()).hexdigest(), 16) % 1000 < TEST_SHARE * 1000


def load_index(data_dir: Path) -> list[dict]:
    return [json.loads(line) for line in (data_dir / "index.jsonl").read_text().splitlines()]


class PairDataset(Dataset):
    def __init__(self, data_dir: Path, images: list[str], epoch_seed: int) -> None:
        self.data_dir, self.images, self.epoch_seed = data_dir, images, epoch_seed

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        label = Image.open(self.data_dir / self.images[index])
        rng = np.random.default_rng([self.epoch_seed, index])
        return to_tensor(render.clean_view(label)), to_tensor(render.synthetic_photo(label, rng))


class CleanDataset(Dataset):
    def __init__(self, data_dir: Path, images: list[str]) -> None:
        self.data_dir, self.images = data_dir, images

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int) -> torch.Tensor:
        return to_tensor(render.clean_view(Image.open(self.data_dir / self.images[index])))


class QueryDataset(Dataset):
    def __init__(self, data_dir: Path, queries: list[dict]) -> None:
        self.data_dir, self.queries = data_dir, queries

    def __len__(self) -> int:
        return len(self.queries)

    def __getitem__(self, index: int) -> torch.Tensor:
        query = self.queries[index]
        label = Image.open(self.data_dir / query["image"])
        return to_tensor(render.synthetic_photo(label, np.random.default_rng([QUERY_SEED, query["seed"]])))


def embed(model: torch.nn.Module, batch: torch.Tensor) -> torch.Tensor:
    return F.normalize(model(pixel_values=batch.to(DEVICE)).pooler_output, dim=-1)


@torch.no_grad()
def embed_all(model: torch.nn.Module, dataset: Dataset) -> torch.Tensor:
    model.eval()
    loader = DataLoader(dataset, batch_size=96, num_workers=WORKERS)
    return torch.cat([embed(model, batch).cpu() for batch in loader])


def build_queries(index: list[dict]) -> list[dict]:
    rng = np.random.default_rng(QUERY_SEED)
    queries = []
    for row in index:
        if not is_test(row["set_id"]):
            continue
        for _ in range(QUERIES_PER_PRODUCT):
            queries.append({"image": row["images"][int(rng.integers(len(row["images"])))], "seed": len(queries)})
    return queries


def evaluate(model: torch.nn.Module, data_dir: Path, index: list[dict], queries: list[dict]) -> dict:
    gallery_images = [image for row in index for image in row["images"]]
    gallery_products = np.array([image.split("/")[0] for image in gallery_images])
    gallery = embed_all(model, CleanDataset(data_dir, gallery_images))
    query_vectors = embed_all(model, QueryDataset(data_dir, queries))
    top = (query_vectors @ gallery.T).topk(5, dim=1).indices.numpy()
    truth_products = np.array([q["image"].split("/")[0] for q in queries])
    truth_images = np.array([q["image"] for q in queries])
    top_products = gallery_products[top]
    return {
        "queries": len(queries),
        "gallery_images": len(gallery_images),
        "gallery_products": len(index),
        "product_top1": float((top_products[:, 0] == truth_products).mean()),
        "product_recall5": float((top_products == truth_products[:, None]).any(axis=1).mean()),
        "exact_image_top1": float((np.array(gallery_images)[top[:, 0]] == truth_images).mean()),
        "top5": [[gallery_images[i] for i in row] for row in top],
    }


def train(model: torch.nn.Module, data_dir: Path, train_images: list[str], out_dir: Path, on_epoch, resume: dict) -> None:
    optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE, weight_decay=0.05)
    started = time.time() - resume["train_seconds"]
    for epoch in range(resume["next_epoch"], MAX_EPOCHS):
        model.train()
        loader = DataLoader(
            PairDataset(data_dir, train_images, epoch), batch_size=BATCH, shuffle=True, num_workers=WORKERS, drop_last=True
        )
        losses = []
        for clean, photo in loader:
            a, b = embed(model, clean), embed(model, photo)
            logits = a @ b.T / TEMPERATURE
            target = torch.arange(len(a), device=DEVICE)
            loss = (F.cross_entropy(logits, target) + F.cross_entropy(logits.T, target)) / 2
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(loss.item())
            if time.time() - started > MAX_TRAIN_SECONDS:
                break
        torch.save(model.state_dict(), out_dir / "matcher.pt")
        state = {"next_epoch": epoch + 1, "train_seconds": time.time() - started}
        (out_dir / "resume.json").write_text(json.dumps(state))
        on_epoch(epoch, float(np.mean(losses)), time.time() - started)
        if time.time() - started > MAX_TRAIN_SECONDS:
            break


def main() -> None:
    data_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    index = load_index(data_dir)
    queries = build_queries(index)
    (out_dir / "queries.json").write_text(json.dumps(queries))
    train_images = [image for row in index if not is_test(row["set_id"]) for image in row["images"]]
    print(f"products {len(index)}  train images {len(train_images)}  test queries {len(queries)}", flush=True)

    model = AutoModel.from_pretrained(BACKBONE).to(DEVICE)
    resume_path, report_path = out_dir / "resume.json", out_dir / "report.json"
    resume = {"next_epoch": 0, "train_seconds": 0.0}
    if resume_path.exists():
        resume = json.loads(resume_path.read_text())
        model.load_state_dict(torch.load(out_dir / "matcher.pt", map_location=DEVICE))
        report = json.loads(report_path.read_text())
        print("RESUME", resume, flush=True)
    else:
        report = {"baseline": evaluate(model, data_dir, index, queries)}
        print("BASELINE", {k: v for k, v in report["baseline"].items() if k != "top5"}, flush=True)
        report_path.write_text(json.dumps(report))

    def on_epoch(epoch: int, loss: float, seconds: float) -> None:
        result = evaluate(model, data_dir, index, queries)
        report[f"epoch_{epoch}"] = {**result, "loss": loss, "train_seconds": seconds}
        report_path.write_text(json.dumps(report))
        print(f"EPOCH {epoch} loss {loss:.4f} {seconds:.0f}s", {k: v for k, v in result.items() if k != "top5"}, flush=True)

    train(model, data_dir, train_images, out_dir, on_epoch, resume)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()

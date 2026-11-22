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
from train_matcher import BATCH, DEVICE, LEARNING_RATE, QUERIES_PER_PRODUCT, TEMPERATURE, PairDataset, load_index, to_tensor

import os

BACKBONE = os.environ.get("MATCHER_BACKBONE", "facebook/dinov2-base")
SPLIT_SALT = os.environ.get("MATCHER_SPLIT_SALT", "run2")
TEST_SHARE = 0.2
VAL_SHARE = 0.1
QUERY_SEED = 20261122
VAL_SEED = 20261123
PROTOTYPE_SEED = 20261124
PROTOTYPE_VIEWS = 4
MAX_TRAIN_SECONDS = int(os.environ.get("MATCHER_MAX_TRAIN_MINUTES", "100")) * 60
VAL_VIEWS = int(os.environ.get("MATCHER_VAL_VIEWS", str(4)))
TRAIN_TIME_ONLY = os.environ.get("MATCHER_TRAIN_TIME_ONLY") == "1"
MAX_EPOCHS = 20
WORKERS = 4


def bucket(set_id: str) -> str:
    value = int(hashlib.sha256(f"{SPLIT_SALT}:{set_id}".encode()).hexdigest(), 16) % 1000
    if value < TEST_SHARE * 1000:
        return "test"
    if value < (TEST_SHARE + VAL_SHARE) * 1000:
        return "val"
    return "train"


def embed(model: torch.nn.Module, batch: torch.Tensor) -> torch.Tensor:
    hidden = model(pixel_values=batch.to(DEVICE)).last_hidden_state
    return F.normalize(torch.cat([hidden[:, 0], hidden[:, 1:].mean(dim=1)], dim=-1), dim=-1)


class ViewDataset(Dataset):
    def __init__(self, data_dir: Path, images: list[str], view: int) -> None:
        self.data_dir, self.images, self.view = data_dir, images, view

    def __len__(self) -> int:
        return len(self.images)

    def __getitem__(self, index: int) -> torch.Tensor:
        label = Image.open(self.data_dir / self.images[index])
        if self.view == 0:
            return to_tensor(render.clean_view(label))
        return to_tensor(render.synthetic_photo(label, np.random.default_rng([PROTOTYPE_SEED, self.view, index])))


class QueryDataset(Dataset):
    def __init__(self, data_dir: Path, queries: list[dict], seed: int) -> None:
        self.data_dir, self.queries, self.seed = data_dir, queries, seed

    def __len__(self) -> int:
        return len(self.queries)

    def __getitem__(self, index: int) -> torch.Tensor:
        query = self.queries[index]
        label = Image.open(self.data_dir / query["image"])
        return to_tensor(render.synthetic_photo(label, np.random.default_rng([self.seed, query["seed"]])))


@torch.no_grad()
def embed_all(model: torch.nn.Module, dataset: Dataset) -> torch.Tensor:
    model.eval()
    loader = DataLoader(dataset, batch_size=64, num_workers=WORKERS)
    return torch.cat([embed(model, batch).cpu() for batch in loader])


def build_queries(index: list[dict], split: str, seed: int) -> list[dict]:
    rng = np.random.default_rng(seed)
    queries = []
    for row in index:
        if bucket(row["set_id"]) != split:
            continue
        for _ in range(QUERIES_PER_PRODUCT):
            queries.append({"image": row["images"][int(rng.integers(len(row["images"])))], "seed": len(queries)})
    return queries


def gallery_vectors(model: torch.nn.Module, data_dir: Path, images: list[str], extra_views: int = PROTOTYPE_VIEWS) -> torch.Tensor:
    views = [embed_all(model, ViewDataset(data_dir, images, view)) for view in range(extra_views + 1)]
    return F.normalize(torch.stack(views).mean(dim=0), dim=-1)


def evaluate(model: torch.nn.Module, data_dir: Path, index: list[dict], queries: list[dict], seed: int, extra_views: int = PROTOTYPE_VIEWS) -> dict:
    gallery_images = [image for row in index for image in row["images"]]
    gallery_products = np.array([image.split("/")[0] for image in gallery_images])
    gallery = gallery_vectors(model, data_dir, gallery_images, extra_views)
    query_vectors = embed_all(model, QueryDataset(data_dir, queries, seed))
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


def summary(result: dict) -> dict:
    return {key: value for key, value in result.items() if key != "top5"}


def main() -> None:
    data_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    index = load_index(data_dir)
    test_queries = build_queries(index, "test", QUERY_SEED)
    val_queries = build_queries(index, "val", VAL_SEED)
    train_images = [image for row in index if bucket(row["set_id"]) == "train" for image in row["images"]]
    print(f"products {len(index)} train images {len(train_images)} val {len(val_queries)} test {len(test_queries)}", flush=True)

    report_path, resume_path = out_dir / "report.json", out_dir / "resume.json"
    model = AutoModel.from_pretrained(BACKBONE).to(DEVICE)
    if resume_path.exists():
        resume = json.loads(resume_path.read_text())
        report = json.loads(report_path.read_text())
        model.load_state_dict(torch.load(out_dir / "last.pt", map_location=DEVICE))
        print("RESUME", resume, flush=True)
    else:
        resume = {"next_epoch": 0, "train_seconds": 0.0, "best_val": -1.0, "best_epoch": None}
        report = {"baseline_val": summary(evaluate(model, data_dir, index, val_queries, VAL_SEED, VAL_VIEWS))}
        print("BASELINE VAL", report["baseline_val"], flush=True)
        report_path.write_text(json.dumps(report))

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
        trained_until = time.time()
        val = summary(evaluate(model, data_dir, index, val_queries, VAL_SEED, VAL_VIEWS))
        if TRAIN_TIME_ONLY:
            started += time.time() - trained_until
        report[f"epoch_{epoch}_val"] = {**val, "loss": float(np.mean(losses)), "train_seconds": time.time() - started}
        torch.save(model.state_dict(), out_dir / "last.pt")
        if val["product_top1"] > resume["best_val"]:
            resume["best_val"], resume["best_epoch"] = val["product_top1"], epoch
            torch.save(model.state_dict(), out_dir / "best.pt")
        resume.update({"next_epoch": epoch + 1, "train_seconds": time.time() - started})
        resume_path.write_text(json.dumps(resume))
        report_path.write_text(json.dumps(report))
        print(f"EPOCH {epoch} val {val} best {resume['best_epoch']}", flush=True)
        if time.time() - started > MAX_TRAIN_SECONDS:
            break

    baseline = AutoModel.from_pretrained(BACKBONE).to(DEVICE)
    report["baseline_test"] = evaluate(baseline, data_dir, index, test_queries, QUERY_SEED)
    print("BASELINE TEST", summary(report["baseline_test"]), flush=True)
    del baseline
    model.load_state_dict(torch.load(out_dir / "best.pt", map_location=DEVICE))
    report["test"] = {**evaluate(model, data_dir, index, test_queries, QUERY_SEED), "epoch": resume["best_epoch"]}
    report_path.write_text(json.dumps(report))
    print("TEST", summary(report["test"]), flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()

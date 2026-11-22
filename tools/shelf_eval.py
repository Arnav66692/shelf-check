import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

MAIN = Path("/Users/arnavsingh/Desktop/Competitions/evohacks-2/shelf-check")
PUBLIC = Path(__file__).resolve().parents[1] / "web" / "public" / "matcher"
OUT = Path(__file__).resolve().parents[1] / "results" / "shelf-scan"
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
SIZE = 336
GAP = 12
SHELVES = 300
THRESHOLDS = [round(0.40 + 0.02 * i, 2) for i in range(26)]


def crop_boxes() -> list[tuple[float, float, float, float]]:
    boxes = [(0.0, 0.0, 1.0, 1.0)]
    for columns in (2, 3, 4):
        boxes += [(c / columns, 0.0, 1 / columns, 1.0) for c in range(columns)]
    for columns, rows in ((2, 2), (3, 2)):
        boxes += [(c / columns, r / rows, 1 / columns, 1 / rows) for r in range(rows) for c in range(columns)]
    return boxes


def fit(image: Image.Image) -> np.ndarray:
    scale = SIZE / max(image.width, image.height)
    resized = image.resize((max(1, round(image.width * scale)), max(1, round(image.height * scale))), Image.BILINEAR)
    canvas = Image.new("RGB", (SIZE, SIZE), (128, 128, 128))
    canvas.paste(resized, ((SIZE - resized.width) // 2, (SIZE - resized.height) // 2))
    array = (np.asarray(canvas, np.float32) / 255 - MEAN) / STD
    return array.transpose(2, 0, 1)


def make_shelf(paths: list[Path], rng: np.random.Generator) -> Image.Image:
    tiles = []
    for path in paths:
        tile = Image.open(path).convert("RGB")
        height = round(SIZE * rng.uniform(0.8, 1.0))
        tiles.append(tile.resize((height, height), Image.BILINEAR))
    width = sum(t.width for t in tiles) + GAP * (len(tiles) - 1)
    shelf = Image.new("RGB", (width, SIZE), (40, 40, 40))
    x = 0
    for tile in tiles:
        shelf.paste(tile, (x, SIZE - tile.height))
        x += tile.width + GAP
    return shelf


def shelf_scores(session: ort.InferenceSession, shelf: Image.Image, gallery: np.ndarray, owners: np.ndarray, products: int) -> dict[int, float]:
    batch = []
    for x, y, w, h in crop_boxes():
        box = (round(x * shelf.width), round(y * shelf.height), round((x + w) * shelf.width), round((y + h) * shelf.height))
        batch.append(fit(shelf.crop(box)))
    vectors = np.concatenate([session.run(None, {"pixels": item[None]})[0] for item in batch])
    best: dict[int, float] = {}
    for vector in vectors:
        per_product = np.full(products, -9.0, np.float32)
        np.maximum.at(per_product, owners, gallery @ vector)
        top = int(np.argmax(per_product))
        best[top] = max(best.get(top, -9.0), float(per_product[top]))
    return best


def run(split: str, seed: int) -> list[dict]:
    meta = json.loads((PUBLIC / "products.json").read_text())
    set_ids = [p["setId"] for p in meta["products"]]
    gallery = np.frombuffer((PUBLIC / "gallery.i8").read_bytes(), np.int8).reshape(-1, meta["dim"]).astype(np.float32) / 127
    owners = np.frombuffer((PUBLIC / "owners.u16").read_bytes(), np.uint16).astype(np.int64)
    queries = json.loads((MAIN / f"results/matcher4/queries/{split}.json").read_text())
    folder = MAIN / f"results/matcher4/queries/{split}"
    session = ort.InferenceSession(str(PUBLIC / "dinov2s-run3.q8.onnx"), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(seed)
    position = {s: i for i, s in enumerate(set_ids)}
    records = []
    for _ in range(SHELVES):
        count = int(rng.integers(3, 5))
        chosen: list[int] = []
        seen: set[str] = set()
        while len(chosen) < count:
            i = int(rng.integers(len(queries)))
            product = queries[i]["image"].split("/")[0]
            if product in seen:
                continue
            seen.add(product)
            chosen.append(i)
        shelf = make_shelf([folder / f"{i:05d}.png" for i in chosen], rng)
        best = shelf_scores(session, shelf, gallery, owners, len(set_ids))
        truth = [position[queries[i]["image"].split("/")[0]] for i in chosen]
        records.append({"truth": truth, "found": {str(k): v for k, v in best.items()}})
    return records


def summarize(records: list[dict], threshold: float) -> dict:
    found_rates, wrong = [], []
    for record in records:
        returned = {int(k) for k, v in record["found"].items() if v >= threshold}
        truth = set(record["truth"])
        found_rates.append(len(returned & truth) / len(truth))
        wrong.append(len(returned - truth))
    return {"threshold": threshold, "found_rate": float(np.mean(found_rates)), "wrong_per_shelf": float(np.mean(wrong))}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    split = sys.argv[1]
    if split == "val":
        records = run("val", 20261122)
        table = [summarize(records, t) for t in THRESHOLDS]
        passing = [row for row in table if row["wrong_per_shelf"] <= 1.0]
        chosen = max(passing, key=lambda row: row["found_rate"]) if passing else None
        (OUT / "val.json").write_text(json.dumps({"table": table, "chosen": chosen}, indent=2))
        print(json.dumps(chosen))
        return
    lock = OUT / "test.json"
    if lock.exists():
        raise SystemExit("test already scored once")
    threshold = json.loads((OUT / "val.json").read_text())["chosen"]["threshold"]
    records = run("test", 20261123)
    result = summarize(records, threshold)
    result["passes"] = result["found_rate"] >= 0.60 and result["wrong_per_shelf"] <= 1.0
    lock.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))


if __name__ == "__main__":
    main()

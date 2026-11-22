import json
import sys
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

MAIN = Path("/Users/arnavsingh/Desktop/Competitions/evohacks-2/shelf-check")
PUBLIC = Path(__file__).resolve().parents[1] / "web" / "public" / "matcher"
MEAN = np.array([0.485, 0.456, 0.406], np.float32)
STD = np.array([0.229, 0.224, 0.225], np.float32)
SIZE = 336


def pixels(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGB").resize((SIZE, SIZE), Image.BILINEAR)
    array = (np.asarray(image, np.float32) / 255 - MEAN) / STD
    return array.transpose(2, 0, 1)[None]


def main(model_name: str) -> None:
    meta = json.loads((PUBLIC / "products.json").read_text())
    gallery = np.frombuffer((PUBLIC / "gallery.i8").read_bytes(), np.int8).reshape(-1, meta["dim"]).astype(np.float32) / 127
    owners = np.frombuffer((PUBLIC / "owners.u16").read_bytes(), np.uint16)
    set_ids = [p["setId"] for p in meta["products"]]
    queries = json.loads((MAIN / "results/matcher4/queries/test.json").read_text())
    folder = MAIN / "results/matcher4/queries/test"
    session = ort.InferenceSession(str(PUBLIC / model_name), providers=["CPUExecutionProvider"])
    top1 = top5 = 0
    started = time.time()
    for i, query in enumerate(queries):
        vector = session.run(None, {"pixels": pixels(folder / f"{i:05d}.png")})[0][0]
        scores = gallery @ vector
        best = np.full(len(set_ids), -9.0, np.float32)
        np.maximum.at(best, owners, scores)
        ranked = np.argsort(-best, kind="stable")[:5]
        truth = query["image"].split("/")[0]
        top1 += set_ids[ranked[0]] == truth
        top5 += truth in {set_ids[r] for r in ranked}
    seconds = (time.time() - started) / len(queries)
    result = {"model": model_name, "queries": len(queries), "top1": top1 / len(queries), "recall5": top5 / len(queries), "seconds_per_query_cpu": seconds}
    print(json.dumps(result))


if __name__ == "__main__":
    main(sys.argv[1])

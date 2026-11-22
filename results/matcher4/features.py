import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import text_match

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = ROOT / "data" / "labels"


@dataclass(frozen=True)
class Gallery:
    index: list
    images: list
    image_product: np.ndarray
    offsets: np.ndarray
    text: text_match.TextIndex


def load_gallery() -> Gallery:
    index = [json.loads(line) for line in (DATA / "index.jsonl").read_text().splitlines()]
    images = [image for row in index for image in row["images"]]
    image_product = np.array([p for p, row in enumerate(index) for _ in row["images"]])
    offsets = np.concatenate([[0], np.cumsum([len(row["images"]) for row in index])[:-1]])
    ocr = text_match.load_ocr(HERE / "ocr" / "gallery_vision.jsonl", strip_prefix="data/labels/")
    return Gallery(index, images, image_product, offsets, text_match.build(index, ocr))


def per_product_max(g: Gallery, image_scores: np.ndarray) -> np.ndarray:
    return np.maximum.reduceat(image_scores, g.offsets, axis=1)


def image_scores(gallery_views: np.ndarray, queries: np.ndarray, mode: str) -> np.ndarray:
    gallery_views = gallery_views.astype(np.float32)
    queries = queries.astype(np.float32)
    if mode == "mean":
        proto = gallery_views.mean(axis=1)
        proto /= np.linalg.norm(proto, axis=1, keepdims=True)
        return queries @ proto.T
    sims = np.einsum("qd,gvd->qgv", queries, gallery_views)
    if mode == "max":
        return sims.max(axis=2)
    if mode == "top2":
        return np.sort(sims, axis=2)[:, :, -2:].mean(axis=2)
    if mode == "clean":
        return sims[:, :, 0]
    raise ValueError(mode)


def truth(g: Gallery, split: str) -> np.ndarray:
    queries = json.loads((HERE / "queries" / f"{split}.json").read_text())
    pos = {row["set_id"]: i for i, row in enumerate(g.index)}
    return np.array([pos[q["image"].split("/")[0]] for q in queries])


def query_texts(split: str, source: str) -> list[str]:
    paths = sorted((HERE / "queries" / split).glob("*.png"))
    texts = [""] * len(paths)
    for part in source.split("+"):
        ocr = {Path(k).name: v for k, v in text_match.load_ocr(HERE / "ocr" / f"{split}_{part}.jsonl").items()}
        texts = [f"{t} {ocr.get(p.name, '')}".strip() for t, p in zip(texts, paths)]
    return texts


def metrics(scores: np.ndarray, truth_products: np.ndarray, ties: str = "pessimistic") -> dict:
    target = scores[np.arange(len(truth_products)), truth_products]
    if ties == "pessimistic":
        rank = (scores >= target[:, None]).sum(axis=1) - 1
    else:
        earlier = np.arange(scores.shape[1])[None, :] < truth_products[:, None]
        rank = (scores > target[:, None]).sum(axis=1) + ((scores == target[:, None]) & earlier).sum(axis=1)
    return {"top1": float((rank == 0).mean()), "recall5": float((rank < 5).mean()), "n": int(len(rank))}

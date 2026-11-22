import itertools
from dataclasses import dataclass
from pathlib import Path

import numpy as np

import features as F
import text_match

HERE = Path(__file__).resolve().parent
CHANNELS = ("img", "txt", "ocr", "key", "num", "sift", "cells", "spread")


@dataclass(frozen=True)
class Split:
    truth: np.ndarray
    channels: dict


def load_split(g: F.Gallery, split: str, image_mode: str, query_variant: str, ocr_source: str, tag: str = "run3", sift_file: str | None = None) -> Split:
    cache = HERE / "cache"
    gallery_views = np.load(cache / f"emb_{tag}_gallery.npy")
    full = F.image_scores(gallery_views, np.load(cache / f"emb_{tag}_{split}.npy"), image_mode)
    if query_variant == "full":
        img = full
    else:
        cropped = F.image_scores(gallery_views, np.load(cache / f"emb_{tag}_{split}_crop.npy"), image_mode)
        img = cropped if query_variant == "crop" else np.maximum(full, cropped) if query_variant == "max" else (full + cropped) / 2
    texts = F.query_texts(split, ocr_source)
    ocr, key, num = text_match.scores(g.text, texts)
    txt = text_match.text_score(g.text, texts)
    s = np.load(cache / (sift_file or f"{split}_sift.npz"))
    return Split(
        F.truth(g, split),
        {
            "img": F.per_product_max(g, img),
            "txt": txt,
            "ocr": ocr,
            "key": key,
            "num": num,
            "sift": F.per_product_max(g, np.log1p(s["inliers"].astype(np.float32))),
            "cells": F.per_product_max(g, s["cells"].astype(np.float32)),
            "spread": F.per_product_max(g, np.log1p(s["inliers"].astype(np.float32) * s["cells"])),
        },
    )


def candidates(sp: Split, k_img: int, k_txt: int, k_sift: int) -> np.ndarray:
    n, p = sp.channels["img"].shape
    mask = np.zeros((n, p), bool)
    text = sp.channels["txt"]
    for score, k in ((sp.channels["img"], k_img), (text, k_txt), (sp.channels["sift"], k_sift)):
        if k:
            top = np.argpartition(-score, k, axis=1)[:, :k]
            np.put_along_axis(mask, top, True, axis=1)
    return mask


def fused(sp: Split, weights: dict, mask: np.ndarray | None) -> np.ndarray:
    total = sum(weights.get(c, 0.0) * sp.channels[c] for c in CHANNELS)
    return np.where(mask, total, -1e9) if mask is not None else total


def coverage(sp: Split, mask: np.ndarray) -> float:
    return float(mask[np.arange(len(sp.truth)), sp.truth].mean())


def search(sp: Split, mask: np.ndarray | None, rows: np.ndarray, grid: dict) -> tuple[dict, dict]:
    sub = Split(sp.truth[rows], {c: v[rows] for c, v in sp.channels.items()})
    sub_mask = mask[rows] if mask is not None else None
    best, best_w = None, None
    names = list(grid)
    for values in itertools.product(*(grid[n] for n in names)):
        w = {"img": 1.0, **dict(zip(names, values))}
        m = F.metrics(fused(sub, w, sub_mask), sub.truth)
        key = (m["top1"], m["recall5"])
        if best is None or key > best:
            best, best_w = key, w
    return best_w, {"top1": best[0], "recall5": best[1]}


def cross_validate(sp: Split, mask: np.ndarray | None, grid: dict, groups: np.ndarray, folds: int = 5) -> dict:
    fold_of = np.array([hash_group(g) % folds for g in groups])
    scores = np.zeros(sp.channels["img"].shape, np.float32)
    for f in range(folds):
        w, _ = search(sp, mask, np.nonzero(fold_of != f)[0], grid)
        held = np.nonzero(fold_of == f)[0]
        scores[held] = fused(Split(sp.truth[held], {c: v[held] for c, v in sp.channels.items()}), w, mask[held] if mask is not None else None)
    return F.metrics(scores, sp.truth)


def hash_group(group: int) -> int:
    return (int(group) * 2654435761) % (2**32)

import numpy as np
import torch

FEATURES = ("img", "img_gap", "img_logrank", "txt", "txt_gap", "ocr", "key", "num", "sift", "sift_gap", "spread", "cells")


def build(channels: dict, mask: np.ndarray) -> np.ndarray:
    def gap(x: np.ndarray) -> np.ndarray:
        masked = np.where(mask, x, -np.inf)
        return x - masked.max(axis=1, keepdims=True)

    img = channels["img"]
    rank = np.argsort(np.argsort(-img, axis=1, kind="stable"), axis=1, kind="stable")
    feats = {
        "img": img,
        "img_gap": gap(img),
        "img_logrank": np.log1p(rank),
        "txt": channels["txt"],
        "txt_gap": gap(channels["txt"]),
        "ocr": channels["ocr"],
        "key": channels["key"],
        "num": channels["num"],
        "sift": channels["sift"],
        "sift_gap": gap(channels["sift"]),
        "spread": channels["spread"],
        "cells": channels["cells"] / 16,
    }
    return np.stack([feats[f] for f in FEATURES], axis=-1).astype(np.float32)


def fit(x: np.ndarray, mask: np.ndarray, truth: np.ndarray, l2: float = 1e-3, steps: int = 300) -> np.ndarray:
    keep = mask[np.arange(len(truth)), truth]
    xt = torch.from_numpy(x[keep])
    mt = torch.from_numpy(mask[keep])
    yt = torch.from_numpy(truth[keep])
    w = torch.zeros(x.shape[-1], requires_grad=True)
    w.data[0] = 10.0
    opt = torch.optim.LBFGS([w], max_iter=steps, line_search_fn="strong_wolfe")

    def closure() -> torch.Tensor:
        opt.zero_grad()
        logits = (xt @ w).masked_fill(~mt, -1e9)
        loss = torch.nn.functional.cross_entropy(logits, yt) + l2 * (w ** 2).sum()
        loss.backward()
        return loss

    opt.step(closure)
    return w.detach().numpy()


def score(x: np.ndarray, mask: np.ndarray, w: np.ndarray) -> np.ndarray:
    return np.where(mask, x @ w, -1e9)

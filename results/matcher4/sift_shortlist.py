import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

import sift

HERE = Path(__file__).resolve().parent
_gallery = None
_cfg = None


def _init(cfg: dict) -> None:
    global _gallery, _cfg
    _gallery, _cfg = sift.load_gallery(HERE / "cache" / "gallery_sift.npz"), cfg
    sift.FEATURES = cfg["features"]


def _one(job: tuple[str, np.ndarray]) -> np.ndarray:
    path, image_ids = job
    image = Image.open(path)
    if _cfg["scale"] != 1:
        image = image.resize((image.width * _cfg["scale"], image.height * _cfg["scale"]), Image.BICUBIC)
    q = sift.features(image)
    if _cfg["scale"] != 1:
        q = (q[0] / _cfg["scale"], q[1], q[2])
    return np.array([sift.match(q, _gallery[i]) for i in image_ids], np.int16).reshape(-1, 2)


def run(paths: list[str], image_ids: list[np.ndarray], cfg: dict, workers: int = 14) -> list[np.ndarray]:
    with ProcessPoolExecutor(workers, initializer=_init, initargs=(cfg,)) as pool:
        return list(pool.map(_one, zip(paths, image_ids), chunksize=8))

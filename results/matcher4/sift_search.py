import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

import sift

HERE = Path(__file__).resolve().parent
_gallery = None


def _init() -> None:
    global _gallery
    _gallery = sift.load_gallery(HERE / "cache" / "gallery_sift.npz")


def search(path: str) -> tuple[np.ndarray, np.ndarray, float]:
    start = time.time()
    query = sift.features(Image.open(path))
    scores = np.array([sift.match(query, g) for g in _gallery], np.int16)
    return scores[:, 0], scores[:, 1], time.time() - start


def main() -> None:
    split = sys.argv[1]
    paths = sorted(str(p) for p in (HERE / "queries" / split).glob("*.png"))
    with ProcessPoolExecutor(int(sys.argv[2]) if len(sys.argv) > 2 else 12, initializer=_init) as pool:
        results = list(pool.map(search, paths, chunksize=4))
    np.savez(
        HERE / "cache" / f"{split}_sift.npz",
        inliers=np.stack([r[0] for r in results]),
        cells=np.stack([r[1] for r in results]),
        seconds=np.array([r[2] for r in results]),
    )
    print(split, len(paths), "mean seconds per query single core", float(np.mean([r[2] for r in results])))


if __name__ == "__main__":
    main()

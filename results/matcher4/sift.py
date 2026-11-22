import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

GALLERY_SIDE = 512
FEATURES = 500
RATIO = 0.75
RANSAC_PIXELS = 5.0
GRID = 4
MIN_MATCHES = 6

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[1] / "data" / "labels"


def features(image: Image.Image, max_side: int | None = None) -> tuple[np.ndarray, np.ndarray, tuple[int, int]]:
    gray = np.asarray(image.convert("L"))
    if max_side and max(gray.shape) != max_side:
        scale = max_side / max(gray.shape)
        gray = cv2.resize(gray, (max(8, round(gray.shape[1] * scale)), max(8, round(gray.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    sift = cv2.SIFT_create(nfeatures=FEATURES)
    keypoints, descriptors = sift.detectAndCompute(gray, None)
    if descriptors is None:
        return np.zeros((0, 2), np.float32), np.zeros((0, 128), np.uint8), gray.shape[::-1]
    points = np.float32([kp.pt for kp in keypoints])
    return points, np.clip(descriptors, 0, 255).astype(np.uint8), gray.shape[::-1]


_matcher = None


def match(query: tuple, gallery: tuple) -> tuple[int, int]:
    global _matcher
    q_points, q_desc, _ = query
    g_points, g_desc, g_size = gallery
    if len(q_desc) < 2 or len(g_desc) < 2:
        return 0, 0
    if _matcher is None:
        _matcher = cv2.BFMatcher(cv2.NORM_L2)
    pairs = _matcher.knnMatch(q_desc.astype(np.float32), g_desc.astype(np.float32), k=2)
    good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < RATIO * n.distance]
    if len(good) < MIN_MATCHES:
        return 0, 0
    src = q_points[[m.queryIdx for m in good]]
    dst = g_points[[m.trainIdx for m in good]]
    _, mask = cv2.findHomography(src, dst, cv2.RANSAC, RANSAC_PIXELS)
    if mask is None:
        return 0, 0
    inliers = dst[mask.ravel() > 0]
    cells = {(int(x * GRID / g_size[0]), int(y * GRID / g_size[1])) for x, y in inliers}
    return int(len(inliers)), len(cells)


def gallery_one(path: str) -> tuple:
    return features(Image.open(DATA / path), GALLERY_SIDE)


def build_gallery(images: list[str], out: Path) -> None:
    with ProcessPoolExecutor(10) as pool:
        feats = list(pool.map(gallery_one, images, chunksize=16))
    counts = np.array([len(f[0]) for f in feats])
    np.savez(
        out,
        images=np.array(images),
        offsets=np.concatenate([[0], np.cumsum(counts)]),
        points=np.concatenate([f[0] for f in feats]),
        descriptors=np.concatenate([f[1] for f in feats]),
        sizes=np.array([f[2] for f in feats]),
    )


def load_gallery(path: Path) -> list[tuple]:
    z = np.load(path)
    off, points, descriptors, sizes = z["offsets"], z["points"], z["descriptors"], z["sizes"]
    return [(points[off[i]:off[i + 1]], descriptors[off[i]:off[i + 1]], tuple(sizes[i])) for i in range(len(off) - 1)]


if __name__ == "__main__":
    import json
    index = [json.loads(line) for line in (DATA / "index.jsonl").read_text().splitlines()]
    images = [image for row in index for image in row["images"]]
    build_gallery(images, HERE / "cache" / "gallery_sift.npz")
    print("gallery sift", len(images))

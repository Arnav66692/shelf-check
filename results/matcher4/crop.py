import cv2
import numpy as np
from PIL import Image

PAD = 0.10
BORDER = 6
THRESHOLD = 28


def label_box(image: Image.Image) -> tuple[int, int, int, int] | None:
    pixels = np.asarray(image.convert("RGB"), np.float32)
    height, width = pixels.shape[:2]
    rows = np.arange(height, dtype=np.float32)
    border = np.zeros((height, width), bool)
    border[:, :BORDER] = border[:, -BORDER:] = True
    ys, xs = np.nonzero(border)
    design = np.stack([np.ones_like(ys, np.float32), rows[ys], xs.astype(np.float32)], 1)
    coef, *_ = np.linalg.lstsq(design, pixels[ys, xs], rcond=None)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    model = coef[0] + yy[..., None] * coef[1] + xx[..., None] * coef[2]
    diff = np.abs(cv2.GaussianBlur(pixels, (0, 0), 2) - model).max(axis=2)
    mask = (diff > THRESHOLD).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    if count < 2:
        return None
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, area = stats[biggest]
    if area < 0.02 * height * width:
        return None
    return int(x), int(y), int(w), int(h)


def label_crop(image: Image.Image) -> Image.Image:
    box = label_box(image)
    size = image.width
    if box is None:
        return image
    x, y, w, h = box
    side = max(w, h) * (1 + 2 * PAD)
    cx, cy = x + w / 2, y + h / 2
    left, top = int(round(cx - side / 2)), int(round(cy - side / 2))
    side = int(round(side))
    padded = cv2.copyMakeBorder(np.asarray(image.convert("RGB")), side, side, side, side, cv2.BORDER_REPLICATE)
    crop = padded[top + side : top + 2 * side, left + side : left + 2 * side]
    return Image.fromarray(cv2.resize(crop, (size, size), interpolation=cv2.INTER_CUBIC))

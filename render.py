import cv2
import numpy as np
from PIL import Image

OUT_SIZE = 336
MIN_KEEP = 0.6
MAX_WRAP_RADIANS = 1.25
MAX_TILT = 0.12
MAX_ROTATION_DEGREES = 12
MAX_BLUR_SIGMA = 1.8
JPEG_QUALITY_RANGE = (35, 90)


def random_crop(image: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    height, width = image.shape[:2]
    keep_w, keep_h = rng.uniform(MIN_KEEP, 1.0, size=2)
    crop_w, crop_h = max(32, int(width * keep_w)), max(32, int(height * keep_h))
    x = rng.integers(0, width - crop_w + 1)
    y = rng.integers(0, height - crop_h + 1)
    return image[y : y + crop_h, x : x + crop_w]


def cylinder_wrap(image: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    half_angle = rng.uniform(0.15, MAX_WRAP_RADIANS)
    height, width = image.shape[:2]
    out_width = max(32, int(width * np.sin(half_angle) / half_angle))
    xs = (np.arange(out_width) + 0.5) / out_width * 2 - 1
    theta = np.arcsin(xs * np.sin(half_angle))
    source_x = ((theta / half_angle + 1) / 2 * (width - 1)).astype(np.float32)
    map_x = np.tile(source_x, (height, 1))
    map_y = np.tile(np.arange(height, dtype=np.float32)[:, None], (1, out_width))
    wrapped = cv2.remap(image, map_x, map_y, cv2.INTER_LINEAR)
    shade = (0.55 + 0.45 * np.cos(theta)) if rng.random() < 0.8 else np.ones_like(theta)
    return np.clip(wrapped * shade[None, :, None], 0, 255).astype(np.uint8)


def background(rng: np.random.Generator) -> np.ndarray:
    base = rng.uniform(40, 230, size=3)
    drift = rng.uniform(-40, 40, size=3)
    ramp = np.linspace(0, 1, OUT_SIZE)[:, None, None]
    canvas = base + drift * ramp + rng.normal(0, 6, size=(OUT_SIZE, OUT_SIZE, 3))
    return np.clip(canvas, 0, 255).astype(np.uint8)


def place(image: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    height, width = image.shape[:2]
    scale = rng.uniform(0.62, 0.95) * OUT_SIZE / max(height, width)
    new_w, new_h = max(8, int(width * scale)), max(8, int(height * scale))
    image = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
    corners = np.float32([[0, 0], [new_w, 0], [new_w, new_h], [0, new_h]])
    jitter = rng.uniform(-MAX_TILT, MAX_TILT, size=(4, 2)) * [new_w, new_h]
    angle = np.deg2rad(rng.uniform(-MAX_ROTATION_DEGREES, MAX_ROTATION_DEGREES))
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    centered = (corners + jitter - [new_w / 2, new_h / 2]) @ rotation.T
    offset = OUT_SIZE / 2 + rng.uniform(-0.06, 0.06, size=2) * OUT_SIZE
    target = np.float32(centered + offset)
    matrix = cv2.getPerspectiveTransform(corners, target)
    canvas = background(rng)
    warped = cv2.warpPerspective(image, matrix, (OUT_SIZE, OUT_SIZE), flags=cv2.INTER_LINEAR)
    mask = cv2.warpPerspective(np.full((new_h, new_w), 255, np.uint8), matrix, (OUT_SIZE, OUT_SIZE))
    canvas[mask > 127] = warped[mask > 127]
    return canvas


def glare(image: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    if rng.random() < 0.45:
        return image
    overlay = np.zeros((OUT_SIZE, OUT_SIZE), np.float32)
    for _ in range(rng.integers(1, 3)):
        center = tuple(int(v) for v in rng.uniform(0.2, 0.8, size=2) * OUT_SIZE)
        axes = tuple(int(v) for v in rng.uniform(0.04, 0.22, size=2) * OUT_SIZE)
        cv2.ellipse(overlay, center, axes, float(rng.uniform(0, 180)), 0, 360, float(rng.uniform(0.4, 1.0)), -1)
    overlay = cv2.GaussianBlur(overlay, (0, 0), OUT_SIZE * 0.05)
    return np.clip(image + overlay[..., None] * 255, 0, 255).astype(np.uint8)


def camera(image: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    pixels = image.astype(np.float32)
    pixels = (pixels - 127.5) * rng.uniform(0.7, 1.25) + 127.5 + rng.uniform(-30, 30)
    pixels *= rng.uniform(0.9, 1.1, size=3)
    pixels = cv2.GaussianBlur(pixels, (0, 0), rng.uniform(0.3, MAX_BLUR_SIGMA))
    pixels += rng.normal(0, rng.uniform(1, 7), size=pixels.shape)
    pixels = np.clip(pixels, 0, 255).astype(np.uint8)
    quality = int(rng.integers(*JPEG_QUALITY_RANGE))
    _, encoded = cv2.imencode(".jpg", pixels, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def synthetic_photo(label: Image.Image, rng: np.random.Generator) -> Image.Image:
    image = np.asarray(label.convert("RGB"))
    image = random_crop(image, rng)
    image = cylinder_wrap(image, rng)
    image = place(image, rng)
    image = glare(image, rng)
    image = camera(image, rng)
    return Image.fromarray(image)


def clean_view(label: Image.Image) -> Image.Image:
    image = label.convert("RGB")
    image.thumbnail((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    canvas = Image.new("RGB", (OUT_SIZE, OUT_SIZE), (255, 255, 255))
    canvas.paste(image, ((OUT_SIZE - image.width) // 2, (OUT_SIZE - image.height) // 2))
    return canvas

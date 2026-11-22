import sys
from pathlib import Path

from PIL import Image, ImageFilter

FACTOR = 2


def upscale(image: Image.Image) -> Image.Image:
    big = image.convert("RGB").resize((image.width * FACTOR, image.height * FACTOR), Image.BICUBIC)
    return big.filter(ImageFilter.UnsharpMask(2, 150, 2))


if __name__ == "__main__":
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    dst.mkdir(parents=True, exist_ok=True)
    for path in sorted(src.glob("*.png")):
        upscale(Image.open(path)).save(dst / path.name)

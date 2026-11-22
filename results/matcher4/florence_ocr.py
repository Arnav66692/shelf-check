import json
import re
import sys
import time
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

MODEL = "florence-community/Florence-2-base-ft"
BATCH = 8
CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z])")


class Florence:
    def __init__(self) -> None:
        self.processor = AutoProcessor.from_pretrained(MODEL)
        self.model = AutoModelForImageTextToText.from_pretrained(MODEL, dtype=torch.float16).to("mps").eval()

    @torch.no_grad()
    def read(self, images: list[Image.Image]) -> list[str]:
        inputs = self.processor(text=["<OCR>"] * len(images), images=[i.convert("RGB") for i in images], return_tensors="pt").to("mps", torch.float16)
        out = self.model.generate(**inputs, max_new_tokens=96, num_beams=1, do_sample=False)
        return [CAMEL.sub(" ", t) for t in self.processor.batch_decode(out, skip_special_tokens=True)]


def main() -> None:
    folder, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    paths = sorted(folder.glob("*.png"))
    reader = Florence()
    rows = []
    for i in range(0, len(paths), BATCH):
        start = time.time()
        texts = reader.read([Image.open(p) for p in paths[i : i + BATCH]])
        per = (time.time() - start) / len(texts)
        rows += [{"path": str(p), "lines": [{"text": t}] if t.strip("- ") else [], "seconds": per} for p, t in zip(paths[i : i + BATCH], texts)]
    out_path.write_text("".join(json.dumps(r) + "\n" for r in rows))
    print(len(rows), "mean seconds", sum(r["seconds"] for r in rows) / len(rows))


if __name__ == "__main__":
    main()

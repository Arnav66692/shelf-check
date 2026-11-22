import json
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))

import crop
import features as F
import render
import sift
import text_match
import upscale
from embed import load_model
from train_matcher import DEVICE, to_tensor
from train_matcher_v2 import embed

OCR_TOOL = HERE / "ocr_tool" / "vision_ocr"


def square(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    if image.size == (render.OUT_SIZE, render.OUT_SIZE):
        return image
    return render.clean_view(image)


def read_text(image: Image.Image) -> str:
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "q.png"
        upscale.upscale(image).save(path)
        (Path(folder) / "list.txt").write_text(str(path) + "\n")
        subprocess.run([str(OCR_TOOL), str(Path(folder) / "list.txt"), str(Path(folder) / "out.jsonl"), "--no-correction", "--workers", "1"], check=True, timeout=60)
        return " ".join(text_match.load_ocr(Path(folder) / "out.jsonl").values())


class Matcher:
    def __init__(self, config_path: Path = HERE / "config.json") -> None:
        self.config = json.loads(config_path.read_text())
        self.gallery = F.load_gallery()
        self.views = np.load(HERE / "cache" / "emb_run3_gallery.npy").astype(np.float32)
        self.model = load_model("run3")
        self.sift_gallery = sift.load_gallery(HERE / "cache" / "gallery_sift.npz")
        self.pool = ThreadPoolExecutor(8)

    @torch.no_grad()
    def _image_scores(self, image: Image.Image) -> np.ndarray:
        variants = [image] if self.config["query_variant"] == "full" else [image, crop.label_crop(image)]
        batch = torch.stack([to_tensor(v) for v in variants])
        vectors = embed(self.model.eval(), batch).cpu().numpy()
        per_variant = F.image_scores(self.views, vectors, self.config["image_mode"])
        scores = per_variant[0] if len(per_variant) == 1 else (per_variant.max(0) if self.config["query_variant"] == "max" else per_variant.mean(0))
        return F.per_product_max(self.gallery, scores[None, :])[0]

    def _sift_scores(self, image: Image.Image, image_ids: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        query = sift.features(image)
        results = list(self.pool.map(lambda i: sift.match(query, self.sift_gallery[i]), image_ids))
        inliers = np.zeros(len(self.gallery.images), np.float32)
        cells = np.zeros(len(self.gallery.images), np.float32)
        inliers[image_ids] = [r[0] for r in results]
        cells[image_ids] = [r[1] for r in results]
        return inliers, cells

    def match(self, photo: Image.Image, top: int = 5) -> dict:
        timings = {}
        start = time.time()
        image = square(photo)
        channels = {"img": self._image_scores(image)}
        timings["image"] = time.time() - start
        t = time.time()
        text = read_text(image)
        texts = [text]
        ocr, key, num = text_match.scores(self.gallery.text, texts)
        channels.update(txt=text_match.text_score(self.gallery.text, texts)[0], ocr=ocr[0], key=key[0], num=num[0])
        timings["ocr"] = time.time() - t
        cfg = self.config
        candidate = np.zeros(len(self.gallery.index), bool)
        for name, k in (("img", cfg["k_img"]), ("txt", cfg["k_txt"])):
            if k:
                candidate[np.argpartition(-channels[name], k)[:k]] = True
        t = time.time()
        if cfg["k_sift"]:
            image_ids = np.arange(len(self.gallery.images))
        else:
            image_ids = np.nonzero(candidate[self.gallery.image_product])[0]
        inliers, cells = self._sift_scores(image, image_ids)
        channels["sift"] = F.per_product_max(self.gallery, np.log1p(inliers)[None, :])[0]
        channels["cells"] = F.per_product_max(self.gallery, cells[None, :])[0]
        channels["spread"] = F.per_product_max(self.gallery, np.log1p(inliers * cells)[None, :])[0]
        if cfg["k_sift"]:
            candidate[np.argpartition(-channels["sift"], cfg["k_sift"])[: cfg["k_sift"]]] = True
        timings["sift"] = time.time() - t
        total = sum(w * channels[c] for c, w in cfg["weights"].items())
        total = np.where(candidate, total, -np.inf)
        order = np.argsort(-total)[:top]
        timings["total"] = time.time() - start
        return {
            "text_read": text,
            "candidates": [
                {
                    "set_id": self.gallery.index[p]["set_id"],
                    "score": float(total[p]),
                    "products": [{"ndc": x["ndc"], "name": x["name"]} for x in self.gallery.index[p]["products"]],
                    "channels": {c: float(channels[c][p]) for c in cfg["weights"]},
                }
                for p in order
            ],
            "seconds": {k: round(v, 3) for k, v in timings.items()},
        }

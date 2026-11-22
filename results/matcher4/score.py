import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np

import features as F
import fuse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PREREG = ROOT / "PREREG-TRAINED-4.md"


def prereg_hashed() -> bool:
    digest = hashlib.sha256(PREREG.read_bytes()).hexdigest()
    return digest in (ROOT / "PREREG.sha256").read_text()


def main() -> None:
    split = sys.argv[1]
    out_path = HERE / f"{split}_result.json"
    if split == "test":
        if not PREREG.exists() or not prereg_hashed():
            sys.exit("PREREG-TRAINED-4.md is missing or its sha256 is not in PREREG.sha256. Write and hash it before scoring test.")
        if out_path.exists():
            sys.exit("test_result.json already exists. The test set is scored once.")
    cfg = json.loads((HERE / "config.json").read_text())
    start = time.time()
    g = F.load_gallery()
    sp = fuse.load_split(g, split, cfg["image_mode"], cfg["query_variant"], cfg["ocr_source"])
    mask = fuse.candidates(sp, cfg["k_img"], cfg["k_txt"], cfg["k_sift"])
    final = fuse.fused(sp, cfg["weights"], mask)
    result = {
        "split": split,
        "queries": int(len(sp.truth)),
        "gallery_products": len(g.index),
        "gallery_images": len(g.images),
        "config": cfg,
        "candidate_coverage": fuse.coverage(sp, mask),
        "hybrid": F.metrics(final, sp.truth, "ordered"),
        "hybrid_pessimistic_ties": F.metrics(final, sp.truth),
        "image_only": F.metrics(sp.channels["img"], sp.truth, "ordered"),
        "text_only": F.metrics(sp.channels["txt"], sp.truth, "ordered"),
        "sift_only": F.metrics(sp.channels["sift"], sp.truth, "ordered"),
        "queries_with_text": int(sum(bool(t.strip()) for t in F.query_texts(split, cfg["ocr_source"]))),
        "seconds": time.time() - start,
    }
    if split == "test":
        result["passes"] = result["hybrid"]["top1"] >= 0.90 and result["hybrid"]["recall5"] >= 0.97 and result["hybrid"]["top1"] - 0.14235654840122647 >= 0.10
    out_path.write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

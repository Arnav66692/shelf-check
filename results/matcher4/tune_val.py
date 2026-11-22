import json
import sys

import numpy as np

import features as F
import fuse

GRID = {
    "txt": [0, 0.1, 0.2, 0.4, 0.8],
    "spread": [0, 0.02, 0.05, 0.1, 0.2],
    "sift": [0, 0.02, 0.05, 0.1],
    "cells": [0, 0.01, 0.02],
    "num": [0, 0.05, 0.1],
}


def main() -> None:
    image_mode, query_variant, k = sys.argv[1], sys.argv[2], tuple(int(x) for x in sys.argv[3].split(","))
    g = F.load_gallery()
    source = sys.argv[4] if len(sys.argv) > 4 else "x2s"
    sp = fuse.load_split(g, "val", image_mode, query_variant, source)
    mask = fuse.candidates(sp, *k)
    rows = np.arange(len(sp.truth))
    weights, best = fuse.search(sp, mask, rows, GRID)
    cv = fuse.cross_validate(sp, mask, GRID, sp.truth)
    ordered = F.metrics(fuse.fused(sp, weights, mask), sp.truth, "ordered")
    out = {"ocr_source": source, "val_fit_ordered_ties": ordered, "image_mode": image_mode, "query_variant": query_variant, "k": k, "coverage": fuse.coverage(sp, mask), "weights": weights, "val_fit": best, "val_cv5": cv}
    print(json.dumps(out))


if __name__ == "__main__":
    main()

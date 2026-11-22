import sys
import time

import numpy as np

import features as F
import fuse
import sift_shortlist



def main() -> None:
    g = F.load_gallery()
    sp = fuse.load_split(g, "val", "clean", "avg", "x2s")
    mask = fuse.candidates(sp, 50, 50, 0)
    paths = [str(p) for p in sorted((F.HERE / "queries" / "val").glob("*.png"))]
    image_ids = [np.nonzero(mask[i][g.image_product])[0] for i in range(len(paths))]
    for scale, feats in [(1, 500), (2, 500), (2, 1000)]:
        t = time.time()
        res = sift_shortlist.run(paths, image_ids, {"scale": scale, "features": feats})
        inl = np.zeros((len(paths), len(g.images)), np.float32)
        cells = np.zeros_like(inl)
        for i, r in enumerate(res):
            inl[i, image_ids[i]] = r[:, 0]
            cells[i, image_ids[i]] = r[:, 1]
        ch = dict(sp.channels)
        ch["sift"] = F.per_product_max(g, np.log1p(inl))
        ch["spread"] = F.per_product_max(g, np.log1p(inl * cells))
        ch["cells"] = F.per_product_max(g, cells)
        sp2 = fuse.Split(sp.truth, ch)
        w, best = fuse.search(sp2, mask, np.arange(len(paths)), {"txt": [0.1, 0.2, 0.4], "spread": [0, 0.02, 0.05, 0.1], "sift": [0, 0.02, 0.05, 0.1]})
        print(scale, feats, round(time.time() - t), "s", w, best, F.metrics(fuse.fused(sp2, w, mask), sp.truth, "ordered"), flush=True)


if __name__ == "__main__":
    main()

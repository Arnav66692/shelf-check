import numpy as np

import features as F
import fuse
import reranker as R


def main() -> None:
    g = F.load_gallery()
    sp = fuse.load_split(g, "val", "clean", "avg", "x2s+florence")
    mask = fuse.candidates(sp, 50, 50, 50)
    cols = np.nonzero(mask.any(axis=0))[0]
    x = R.build(sp.channels, mask)
    tr = sp.truth
    folds = np.array([fuse.hash_group(t) % 5 for t in tr])
    for l2 in (1e-4, 1e-3, 1e-2):
        out = np.full(mask.shape, -1e9, np.float32)
        for f in range(5):
            tr_rows, te_rows = folds != f, folds == f
            w = R.fit(x[tr_rows], mask[tr_rows], tr[tr_rows], l2)
            out[te_rows] = R.score(x[te_rows], mask[te_rows], w)
        w_all = R.fit(x, mask, tr, l2)
        fit_all = R.score(x, mask, w_all)
        print(l2, "cv", F.metrics(out, tr, "ordered"), "fit", F.metrics(fit_all, tr, "ordered"), np.round(w_all, 2).tolist(), flush=True)


if __name__ == "__main__":
    main()

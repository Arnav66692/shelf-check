import json

import numpy as np
import torch

import features as F
import fuse
import patch_match as P
from embed import FileDataset, load_model
from train_matcher import CleanDataset

TOP = 10


def main() -> None:
    g = F.load_gallery()
    sp = fuse.load_split(g, "val", "clean", "avg", "x2s+florence")
    mask = fuse.candidates(sp, 50, 50, 50)
    base = fuse.fused(sp, {"img": 1, "txt": 0.2, "spread": 0.02, "sift": 0.02}, mask)
    top = np.argsort(-base, axis=1, kind="stable")[:, :TOP]
    model = load_model("run3")
    gal = P.tokens(model, CleanDataset(F.DATA, g.images))
    paths = sorted((F.HERE / "queries" / "val").glob("*.png"))
    qt = P.tokens(model, FileDataset(paths, False))
    mnn = np.zeros(base.shape, np.float32)
    cham = np.zeros(base.shape, np.float32)
    for i in range(len(paths)):
        ids = np.nonzero(np.isin(g.image_product, top[i]))[0]
        m, c = P.pair_scores(qt[i], gal[ids])
        np.maximum.at(mnn[i], g.image_product[ids], m)
        np.maximum.at(cham[i], g.image_product[ids], c)
    np.savez(F.HERE / "cache" / "val_patch.npz", top=top, mnn=mnn, cham=cham, base=base)
    tr = sp.truth
    print("base", F.metrics(base, tr, "ordered"))
    rows = np.arange(len(tr))[:, None]
    in_top = np.zeros(base.shape, bool)
    in_top[rows, top] = True
    for name, ch in (("mnn", mnn / 100), ("cham", cham)):
        for w in (0.05, 0.1, 0.2, 0.5, 1, 2):
            s = np.where(in_top, base + w * ch + 100, base)
            print(name, w, F.metrics(s, tr, "ordered"))


if __name__ == "__main__":
    main()

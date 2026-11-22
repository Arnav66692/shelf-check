import sys

import numpy as np

import features as F
import fuse

g = F.load_gallery()
sp = fuse.load_split(g, "val", sys.argv[1], sys.argv[2], "x2s")
for c, v in sp.channels.items():
    print(c, F.metrics(v, sp.truth))
for k in [(5, 0, 0), (50, 0, 0), (50, 50, 0), (50, 50, 50), (100, 50, 50), (200, 100, 100)]:
    print("coverage", k, round(fuse.coverage(sp, fuse.candidates(sp, *k)), 4))

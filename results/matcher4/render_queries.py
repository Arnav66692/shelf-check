import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

os.environ["MATCHER_SPLIT_SALT"] = "run3"
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import numpy as np
from PIL import Image

import render
import train_matcher_v2 as v2
from train_matcher import load_index

DATA = Path(__file__).resolve().parents[2] / "data" / "labels"
OUT = Path(__file__).resolve().parent / "queries"


def draw(job: tuple[str, int, dict]) -> None:
    split, seed, query = job
    path = OUT / split / f"{query['seed']:05d}.png"
    if path.exists():
        return
    label = Image.open(DATA / query["image"])
    render.synthetic_photo(label, np.random.default_rng([seed, query["seed"]])).save(path)


def main() -> None:
    assert v2.SPLIT_SALT == "run3"
    index = load_index(DATA)
    splits = {"val": (v2.VAL_SEED, v2.build_queries(index, "val", v2.VAL_SEED)), "test": (v2.QUERY_SEED, v2.build_queries(index, "test", v2.QUERY_SEED))}
    jobs = []
    for split, (seed, queries) in splits.items():
        (OUT / split).mkdir(parents=True, exist_ok=True)
        (OUT / f"{split}.json").write_text(json.dumps(queries))
        jobs += [(split, seed, q) for q in queries]
    with ProcessPoolExecutor(6) as pool:
        list(pool.map(draw, jobs, chunksize=32))
    print({split: len(queries) for split, (_, queries) in splits.items()})


if __name__ == "__main__":
    main()

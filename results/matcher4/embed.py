import os
import sys
from pathlib import Path

os.environ["MATCHER_SPLIT_SALT"] = "run3"
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset
from transformers import AutoModel

import crop
import train_matcher_v2 as v2
from train_matcher import DEVICE, load_index, to_tensor

HERE = Path(__file__).resolve().parent
BACKBONE = "facebook/dinov2-small"


class FileDataset(Dataset):
    def __init__(self, paths: list[Path], cropped: bool) -> None:
        self.paths, self.cropped = paths, cropped

    def __len__(self) -> int:
        return len(self.paths)

    def __getitem__(self, index: int) -> torch.Tensor:
        image = Image.open(self.paths[index]).convert("RGB")
        return to_tensor(crop.label_crop(image) if self.cropped else image)


def load_model(tag: str) -> torch.nn.Module:
    model = AutoModel.from_pretrained(BACKBONE).to(DEVICE)
    if tag == "run3":
        model.load_state_dict(torch.load(ROOT / "results" / "matcher3" / "best.pt", map_location=DEVICE))
    return model.eval()


def main() -> None:
    tag, splits = sys.argv[1], sys.argv[2:]
    model = load_model(tag)
    data = ROOT / "data" / "labels"
    out = HERE / "cache"
    gallery_path = out / f"emb_{tag}_gallery.npy"
    if not gallery_path.exists():
        images = [image for row in load_index(data) for image in row["images"]]
        views = [v2.embed_all(model, v2.ViewDataset(data, images, view)).numpy() for view in range(v2.PROTOTYPE_VIEWS + 1)]
        np.save(gallery_path, np.stack(views, axis=1).astype(np.float16))
    for split in splits:
        paths = sorted((HERE / "queries" / split).glob("*.png"))
        for cropped in (False, True):
            name = out / f"emb_{tag}_{split}{'_crop' if cropped else ''}.npy"
            if not name.exists():
                np.save(name, v2.embed_all(model, FileDataset(paths, cropped)).numpy().astype(np.float16))
    print("done", tag, splits)


if __name__ == "__main__":
    main()

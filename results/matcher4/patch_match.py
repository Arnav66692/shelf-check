import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as TF
from PIL import Image
from torch.utils.data import DataLoader

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))
sys.path.insert(0, str(HERE))

import train_matcher_v2 as v2
from embed import FileDataset, load_model
from train_matcher import DEVICE, CleanDataset

MNN_THRESHOLD = 0.5


@torch.no_grad()
def tokens(model: torch.nn.Module, dataset, batch: int = 64) -> torch.Tensor:
    out = []
    for x in DataLoader(dataset, batch_size=batch, num_workers=4):
        hidden = model(pixel_values=x.to(DEVICE)).last_hidden_state[:, 1:]
        out.append(TF.normalize(hidden, dim=-1).half())
    return torch.cat(out)


@torch.no_grad()
def pair_scores(query: torch.Tensor, gallery: torch.Tensor) -> tuple[np.ndarray, np.ndarray]:
    sims = torch.einsum("pd,gqd->gpq", query.float(), gallery.float())
    best_g, idx_g = sims.max(dim=2)
    best_q, idx_q = sims.max(dim=1)
    arange = torch.arange(query.shape[0], device=sims.device)
    mutual = (idx_q.gather(1, idx_g) == arange[None, :]) & (best_g > MNN_THRESHOLD)
    return mutual.sum(dim=1).cpu().numpy(), best_g.mean(dim=1).cpu().numpy()

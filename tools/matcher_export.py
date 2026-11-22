import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoModel

MAIN = Path("/Users/arnavsingh/Desktop/Competitions/evohacks-2/shelf-check")
OUT = Path(__file__).resolve().parents[1] / "web" / "public" / "matcher"
SIZE = 336


class Embedder(torch.nn.Module):
    def __init__(self, backbone: torch.nn.Module) -> None:
        super().__init__()
        self.backbone = backbone

    def forward(self, pixels: torch.Tensor) -> torch.Tensor:
        hidden = self.backbone(pixel_values=pixels).last_hidden_state
        return F.normalize(torch.cat([hidden[:, 0], hidden[:, 1:].mean(dim=1)], dim=-1), dim=-1)


def export(path: Path) -> None:
    backbone = AutoModel.from_pretrained("facebook/dinov2-small")
    state = torch.load(MAIN / "results" / "matcher3" / "best.pt", map_location="cpu")
    expected = set(backbone.state_dict())
    if not set(state) <= expected:
        renames = {"attention.q_proj": "attention.attention.query", "attention.k_proj": "attention.attention.key", "attention.v_proj": "attention.attention.value", "attention.o_proj": "attention.output.dense"}
        for old, new in renames.items():
            state = {key.replace(old, new): value for key, value in state.items()}
    backbone.load_state_dict(state)
    model = Embedder(backbone.eval()).eval()
    dummy = torch.zeros(1, 3, SIZE, SIZE)
    torch.onnx.export(model, (dummy,), str(path), input_names=["pixels"], output_names=["embedding"], opset_version=17, dynamo=False)


def gallery() -> None:
    index = [json.loads(line) for line in (MAIN / "data" / "labels" / "index.jsonl").read_text().splitlines()]
    images = [image for row in index for image in row["images"]]
    views = np.load(MAIN / "results" / "matcher4" / "cache" / "emb_run3_gallery.npy")
    clean = views[:, 0, :].astype(np.float32)
    clean /= np.linalg.norm(clean, axis=1, keepdims=True)
    product_of_image = [image.split("/")[0] for image in images]
    set_ids = [row["set_id"] for row in index]
    position = {set_id: i for i, set_id in enumerate(set_ids)}
    owners = np.array([position[p] for p in product_of_image], np.uint16)
    quantized = np.clip(np.round(clean * 127), -127, 127).astype(np.int8)
    (OUT / "gallery.i8").write_bytes(quantized.tobytes())
    (OUT / "owners.u16").write_bytes(owners.tobytes())
    products = [
        {
            "setId": row["set_id"],
            "kind": row["kind"],
            "name": (row["products"][0]["name"] if row["products"] else ""),
            "ndc": (row["products"][0]["ndc"] if row["products"] else ""),
            "actives": [a["name"].lower() for a in (row["products"][0]["actives"] if row["products"] else [])],
        }
        for row in index
    ]
    (OUT / "products.json").write_text(json.dumps({"dim": int(clean.shape[1]), "images": len(images), "products": products}))
    print("gallery", quantized.shape, "products", len(products))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    if "export" in sys.argv:
        export(OUT / "dinov2s-run3.fp32.onnx")
    if "gallery" in sys.argv:
        gallery()

import base64
import io
import json

import requests
import torch
from PIL import Image
from transformers import AutoProcessor, Florence2ForConditionalGeneration

FLORENCE = "florence-community/Florence-2-base-ft"
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
MAX_SIDE = 2304
TILE = 768
STRIDE = 640
ROTATIONS = (0, 90, 180, 270)
OLLAMA_URL = "http://localhost:11434/api/chat"
VLM_MAX_SIDE = 1568
VLM_TIMEOUT_SECONDS = 600
VLM_ATTEMPTS = 3
VLM_CONTEXT_TOKENS = 8192
VLM_PROMPT = (
    "Read this medicine or supplement label. Reply with JSON only, in this shape: "
    '{"ndc": string or null, "product_name": string, "active_ingredients": '
    '[{"name": string, "strength_value": number, "strength_unit": string}]}. '
    "Copy the NDC code exactly as printed. List only active ingredients with the amount printed "
    "for each. Do not guess anything that is not printed."
)


def fit(image: Image.Image, max_side: int) -> Image.Image:
    scale = max_side / max(image.size)
    if scale >= 1:
        return image
    return image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)


def tiles(image: Image.Image) -> list[Image.Image]:
    if max(image.size) <= TILE * 1.2:
        return [image]
    xs = list(range(0, max(image.width - TILE, 0) + 1, STRIDE)) or [0]
    ys = list(range(0, max(image.height - TILE, 0) + 1, STRIDE)) or [0]
    if xs[-1] + TILE < image.width:
        xs.append(image.width - TILE)
    if ys[-1] + TILE < image.height:
        ys.append(image.height - TILE)
    return [image.crop((x, y, min(x + TILE, image.width), min(y + TILE, image.height))) for y in ys for x in xs]


class FlorenceReader:
    name = "A_florence2_base"

    def __init__(self) -> None:
        self.processor = AutoProcessor.from_pretrained(FLORENCE)
        self.model = Florence2ForConditionalGeneration.from_pretrained(FLORENCE).to(DEVICE).eval()

    @torch.no_grad()
    def ocr(self, image: Image.Image) -> str:
        inputs = self.processor(text="<OCR>", images=image, return_tensors="pt").to(DEVICE)
        ids = self.model.generate(**inputs, max_new_tokens=768, num_beams=1, do_sample=False)
        return self.processor.batch_decode(ids, skip_special_tokens=True)[0].strip()

    def read(self, path: str) -> str:
        image = fit(Image.open(path).convert("RGB"), MAX_SIDE)
        parts = []
        for angle in ROTATIONS:
            rotated = image.rotate(angle, expand=True) if angle else image
            parts.extend(self.ocr(tile) for tile in tiles(rotated))
        return "\n".join(p for p in parts if p)


class OllamaReader:
    def __init__(self, model: str) -> None:
        self.model = model
        self.name = f"B_{model}"

    def ask(self, payload: dict) -> str:
        last_error: Exception | None = None
        for _ in range(VLM_ATTEMPTS):
            try:
                return requests.post(OLLAMA_URL, json=payload, timeout=VLM_TIMEOUT_SECONDS).json()["message"]["content"]
            except (requests.Timeout, requests.ConnectionError, KeyError) as error:
                last_error = error
        raise RuntimeError(f"vision model gave no answer after {VLM_ATTEMPTS} attempts") from last_error

    def read(self, path: str) -> str:
        buffer = io.BytesIO()
        fit(Image.open(path).convert("RGB"), VLM_MAX_SIDE).save(buffer, format="JPEG", quality=92)
        payload = {
            "model": self.model,
            "stream": False,
            "format": "json",
            "options": {"temperature": 0, "num_ctx": VLM_CONTEXT_TOKENS},
            "messages": [
                {"role": "user", "content": VLM_PROMPT, "images": [base64.b64encode(buffer.getvalue()).decode()]}
            ],
        }
        reply = self.ask(payload)
        try:
            data = json.loads(reply)
        except json.JSONDecodeError:
            return reply
        lines = [f"NDC {data['ndc']}"] if data.get("ndc") else []
        lines.append(str(data.get("product_name", "")))
        for item in data.get("active_ingredients") or []:
            lines.append(f"{item.get('name', '')} {item.get('strength_value', '')} {item.get('strength_unit', '')}")
        return "\n".join(lines)

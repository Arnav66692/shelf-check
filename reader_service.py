import io
import re
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

import readers
import verify

MODEL = "qwen3-vl:8b"
MAX_UPLOAD_BYTES = 12 * 1024 * 1024
CODE_LINE = re.compile(r"^NDC\s+(.+)$", re.IGNORECASE)

app = FastAPI(title="Shelf Check label reader")
reader = readers.OllamaReader(MODEL)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL}


@app.post("/read")
async def read(photo: UploadFile = File(...)) -> dict:
    blob = await photo.read()
    if len(blob) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The photo is larger than 12 MB.")
    try:
        image = Image.open(io.BytesIO(blob)).convert("RGB")
    except UnidentifiedImageError as error:
        raise HTTPException(status_code=415, detail="That file is not a picture this reader can open.") from error
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / "photo.jpg"
        image.save(path, quality=92)
        try:
            text = reader.read(str(path))
        except RuntimeError as error:
            raise HTTPException(status_code=504, detail=str(error)) from error
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    codes = [match.group(1).strip() for line in lines if (match := CODE_LINE.match(line))]
    others = [line for line in lines if not CODE_LINE.match(line)]
    agreement = verify.verify(text)
    return {
        "code": codes[0] if codes else None,
        "name": others[0] if others else None,
        "lines": lines,
        "agreement": {"status": agreement["status"], "by": agreement["by"], "product_ndc": agreement.get("product_ndc")},
    }

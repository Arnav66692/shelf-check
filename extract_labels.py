import io
import json
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image

NS = {"v": "urn:hl7-org:v3"}
PACKAGE_LABEL_CODE = "51945-4"
KEEP_FOLDERS = ("prescription", "otc")
MAX_SIDE = 1024
MIN_SIDE = 160
MAX_IMAGES_PER_PRODUCT = 4


def package_label_files(root: ElementTree.Element) -> list[str]:
    media = {
        node.get("ID"): ref.get("value")
        for node in root.iterfind(".//v:observationMedia", NS)
        for ref in node.iterfind("./v:value/v:reference", NS)
    }
    files = []
    for section in root.iterfind(".//v:section", NS):
        code = section.find("./v:code", NS)
        if code is None or code.get("code") != PACKAGE_LABEL_CODE:
            continue
        for render in section.iterfind(".//v:renderMultiMedia", NS):
            name = media.get(render.get("referencedObject"))
            if name and name not in files:
                files.append(name)
    return files


def products(root: ElementTree.Element) -> list[dict]:
    rows = []
    for product in root.iterfind(".//v:manufacturedProduct/v:manufacturedProduct", NS):
        code = product.find("./v:code", NS)
        name = product.find("./v:name", NS)
        actives = []
        for ingredient in product.iterfind("./v:ingredient", NS):
            if not (ingredient.get("classCode") or "").startswith("ACT"):
                continue
            substance = ingredient.find("./v:ingredientSubstance/v:name", NS)
            numerator = ingredient.find("./v:quantity/v:numerator", NS)
            actives.append(
                {
                    "name": (substance.text or "").strip() if substance is not None else "",
                    "value": numerator.get("value") if numerator is not None else None,
                    "unit": numerator.get("unit") if numerator is not None else None,
                }
            )
        rows.append(
            {
                "ndc": code.get("code") if code is not None else None,
                "name": "".join(name.itertext()).strip() if name is not None else "",
                "actives": actives,
            }
        )
    return rows


def save_image(blob: bytes, path: Path) -> bool:
    try:
        image = Image.open(io.BytesIO(blob)).convert("RGB")
    except Exception:
        return False
    if min(image.size) < MIN_SIDE:
        return False
    image.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    image.save(path, quality=88)
    return True


def main() -> None:
    archive_path, out_dir, limit = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3])
    out_dir.mkdir(parents=True, exist_ok=True)
    kept = 0
    with zipfile.ZipFile(archive_path) as outer, (out_dir / "index.jsonl").open("w") as index:
        for entry in outer.namelist():
            folder = entry.split("/")[0]
            if folder not in KEEP_FOLDERS or not entry.endswith(".zip"):
                continue
            try:
                inner = zipfile.ZipFile(io.BytesIO(outer.read(entry)))
                xml_name = next(n for n in inner.namelist() if n.endswith(".xml"))
                root = ElementTree.fromstring(inner.read(xml_name))
            except Exception as exc:
                print("skip", entry, repr(exc)[:80], flush=True)
                continue
            set_id_node = root.find("./v:setId", NS)
            wanted = package_label_files(root)
            if set_id_node is None or not wanted:
                continue
            set_id = set_id_node.get("root")
            folder_out = out_dir / set_id
            folder_out.mkdir(exist_ok=True)
            saved = []
            for name in wanted[:MAX_IMAGES_PER_PRODUCT]:
                if name in inner.namelist() and save_image(inner.read(name), folder_out / f"{len(saved)}.jpg"):
                    saved.append(f"{set_id}/{len(saved)}.jpg")
            if not saved:
                continue
            index.write(json.dumps({"set_id": set_id, "kind": folder, "images": saved, "products": products(root)}) + "\n")
            kept += 1
            if kept % 500 == 0:
                print(kept, "products", flush=True)
            if kept >= limit:
                break
    print("DONE", kept, "products")


if __name__ == "__main__":
    main()

import json
import sys
import time
from pathlib import Path

import requests

FDA = "https://api.fda.gov/drug"
DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2"
MIN_IMAGE_BYTES = 30_000
MAX_CANDIDATES = 4
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "label-reader-pilot/0.1"

PRODUCTS = [
    ("otc", "tylenol_es", 'openfda.brand_name:"Tylenol Extra Strength"'),
    ("otc", "nyquil", 'openfda.brand_name:"Vicks NyQuil Cold and Flu"'),
    ("otc", "benadryl", 'openfda.brand_name:"Benadryl Allergy"'),
    ("otc", "tylenol_pm", 'openfda.brand_name:"Tylenol PM Extra Strength"'),
    ("otc", "bayer_aspirin", 'openfda.brand_name:"Bayer Genuine Aspirin"'),
    ("otc", "advil", 'openfda.brand_name:"Advil" AND openfda.generic_name:"ibuprofen"'),
    ("otc", "claritin", 'openfda.brand_name:"Claritin" AND openfda.generic_name:"loratadine"'),
    ("otc", "mucinex", 'openfda.brand_name:"Mucinex" AND openfda.generic_name:"guaifenesin"'),
    ("rx", "warfarin", 'openfda.generic_name:"warfarin sodium" AND openfda.route:"ORAL"'),
    ("rx", "lisinopril", 'openfda.generic_name:"lisinopril"'),
    ("rx", "sertraline", 'openfda.generic_name:"sertraline hydrochloride"'),
    ("rx", "metformin", 'openfda.generic_name:"metformin hydrochloride"'),
    ("rx", "atorvastatin", 'openfda.generic_name:"atorvastatin calcium"'),
    ("rx", "amoxicillin", 'openfda.generic_name:"amoxicillin" AND openfda.dosage_form:"CAPSULE"'),
    ("rx", "levothyroxine", 'openfda.generic_name:"levothyroxine sodium" AND openfda.route:"ORAL"'),
    ("rx", "omeprazole", 'openfda.generic_name:"omeprazole" AND openfda.product_type:"HUMAN PRESCRIPTION DRUG"'),
]


def get_json(url: str, params: dict | None = None) -> dict:
    for attempt in range(3):
        resp = SESSION.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        time.sleep(1 + attempt)
    resp.raise_for_status()
    return {}


def label_record(query: str) -> dict:
    data = get_json(f"{FDA}/label.json", {"search": query, "limit": 5})
    for rec in data["results"]:
        if rec.get("openfda", {}).get("spl_set_id") and rec["openfda"].get("product_ndc"):
            return rec
    raise LookupError(query)


def structured_ingredients(product_ndcs: list[str]) -> list[dict]:
    rows = []
    for ndc in product_ndcs:
        data = get_json(f"{FDA}/ndc.json", {"search": f'product_ndc:"{ndc}"', "limit": 1})
        res = data["results"][0]
        rows.append(
            {
                "product_ndc": ndc,
                "dosage_form": res.get("dosage_form"),
                "active_ingredients": res.get("active_ingredients", []),
            }
        )
    return rows


def download_images(set_id: str, folder: Path) -> list[str]:
    media = get_json(f"{DAILYMED}/spls/{set_id}/media.json")["data"]["media"]
    saved = []
    for item in media:
        if item.get("mime_type") != "image/jpeg" or len(saved) >= MAX_CANDIDATES:
            continue
        blob = SESSION.get(item["url"], timeout=60).content
        if len(blob) < MIN_IMAGE_BYTES:
            continue
        path = folder / item["name"]
        path.write_bytes(blob)
        saved.append(path.name)
    return saved


def main() -> None:
    OUT = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    products = []
    for kind, key, query in PRODUCTS:
        try:
            rec = label_record(query)
            openfda = rec["openfda"]
            set_id = openfda["spl_set_id"][0]
            folder = OUT / key
            folder.mkdir(exist_ok=True)
            entry = {
                "key": key,
                "kind": kind,
                "brand_name": openfda.get("brand_name"),
                "generic_name": openfda.get("generic_name"),
                "spl_set_id": set_id,
                "variants": structured_ingredients(openfda["product_ndc"][:8]),
                "candidate_images": download_images(set_id, folder),
            }
            products.append(entry)
            print(key, entry["brand_name"], len(entry["variants"]), "variants", entry["candidate_images"], flush=True)
        except Exception as exc:
            print(key, "FAILED", repr(exc), flush=True)
    (OUT / "candidates.json").write_text(json.dumps(products, indent=1))


if __name__ == "__main__":
    main()

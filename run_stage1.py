import json
import sys
import time
from pathlib import Path

import matcher
import readers

ROOT = Path(__file__).parent / "testset"


def truth_items(product: dict) -> list[dict]:
    return [
        {"ingredient": matcher.to_ingredient(t["ingredient"]) or t["ingredient"], "value": float(t["value"]), "unit": t["unit"]}
        for t in product["truth"]
    ]


def score(product: dict, result: dict) -> dict:
    truth = truth_items(product)
    predicted = result["items"]
    ingredients_right = {t["ingredient"] for t in truth} == {p["ingredient"] for p in predicted}
    by_name = {p["ingredient"]: p for p in predicted}
    strength_right = ingredients_right and all(
        abs(by_name[t["ingredient"]]["value"] - t["value"]) < 1e-6 and by_name[t["ingredient"]]["unit"] == t["unit"]
        for t in truth
    )
    return {"ingredients_right": ingredients_right, "strength_right": strength_right}


def main() -> None:
    reader_kind, out_path = sys.argv[1], Path(sys.argv[2])
    spec_path = Path(sys.argv[3]) if len(sys.argv) > 3 else ROOT / "products.json"
    image_root = Path(sys.argv[4]) if len(sys.argv) > 4 else spec_path.parent
    reader = readers.FlorenceReader() if reader_kind == "florence" else readers.OllamaReader(reader_kind)
    spec = json.loads(spec_path.read_text())
    readings_path = out_path.with_suffix(".readings.json")
    readings = json.loads(readings_path.read_text()) if readings_path.exists() else {}
    rows = {}
    for product in spec["products"]:
        if product["key"] not in readings:
            start = time.perf_counter()
            text = reader.read(str(image_root / product["image"]))
            readings[product["key"]] = {"text": text, "seconds": time.perf_counter() - start}
            readings_path.write_text(json.dumps(readings, indent=1))
        text, read_seconds = readings[product["key"]]["text"], readings[product["key"]]["seconds"]
        result = matcher.match(text)
        rows[product["key"]] = {
            "kind": product["kind"],
            "text": text,
            "result": result,
            "read_seconds": round(read_seconds, 1),
            **score(product, result),
        }
        row = rows[product["key"]]
        print(
            f"{product['key']:20s} ing={row['ingredients_right']!s:5} str={row['strength_right']!s:5} "
            f"route={result['route']:4s} {read_seconds:5.1f}s {result['items']}",
            flush=True,
        )

    def flags_for(a: str, b: str) -> list[dict]:
        return matcher.pair_flags(rows[a]["result"], rows[b]["result"])

    planted = []
    for a, b, kind in spec["planted_pairs"]:
        flags = flags_for(a, b)
        both_read = rows[a]["ingredients_right"] and rows[b]["ingredients_right"]
        planted.append({"pair": [a, b], "want": kind, "caught": both_read and any(f["type"] == kind for f in flags), "flags": flags})
    safe = [{"pair": [a, b], "flags": flags_for(a, b)} for a, b in spec["safe_pairs"]]

    drugs = [r for r in rows.values() if r["kind"] != "supplement"]
    summary = {
        "reader": reader.name,
        "ingredients_right": sum(r["ingredients_right"] for r in rows.values()),
        "of": len(rows),
        "strength_right": sum(r["strength_right"] for r in drugs),
        "of_drugs": len(drugs),
        "confidently_wrong": sum(bool(r["result"]["items"]) and not r["strength_right"] for r in drugs),
        "no_answer": sum(not r["result"]["items"] for r in rows.values()),
        "planted_caught": sum(p["caught"] for p in planted),
        "false_alarms": sum(bool(s["flags"]) for s in safe),
    }
    out_path.write_text(json.dumps({"summary": summary, "rows": rows, "planted": planted, "safe": safe}, indent=1))
    print("SUMMARY", json.dumps(summary))
    for p in planted:
        print("PLANTED", p["pair"], p["want"], "caught" if p["caught"] else "MISSED", [f["type"] + ":" + f["ingredient"] for f in p["flags"]])
    for s in safe:
        print("SAFE", s["pair"], [f["type"] + ":" + f["ingredient"] for f in s["flags"]] or "no flags")


if __name__ == "__main__":
    main()

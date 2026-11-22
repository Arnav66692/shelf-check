import json
import sys
from collections import Counter
from pathlib import Path

import verify


def truth_facts(product: dict) -> frozenset:
    return frozenset((verify.base_name(t["ingredient"]) or t["ingredient"], float(t["value"]), t["unit"]) for t in product["truth"])


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text())
    readings = json.loads(Path(sys.argv[2]).read_text())
    rows = []
    for product in spec["products"]:
        outcome = verify.verify(readings[product["key"]]["text"])
        right = frozenset(tuple(f) for f in outcome["facts"]) == truth_facts(product)
        rows.append({"key": product["key"], "kind": product["kind"], "right": right, **outcome})
    verified = [r for r in rows if r["status"] == "verified"]
    summary = {
        "labels": len(rows),
        "verified": len(verified),
        "verified_wrong": sum(not r["right"] for r in verified),
        "status": dict(Counter(r["status"] for r in rows)),
        "verified_by": dict(Counter(r["by"] for r in verified)),
        "check_right": sum(r["right"] for r in rows if r["status"] == "check"),
        "check_total": sum(r["status"] == "check" for r in rows),
    }
    if len(sys.argv) > 3:
        Path(sys.argv[3]).write_text(json.dumps({"summary": summary, "rows": rows}, indent=1))
    print("SUMMARY", json.dumps(summary))
    for r in verified:
        if not r["right"]:
            print("VERIFIED BUT WRONG", r["key"], r["by"], r["facts"])


if __name__ == "__main__":
    main()

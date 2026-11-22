import json
import sys
import time
from pathlib import Path

import readers


def main() -> None:
    model, spec_path, image_root, out_path = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4])
    reader = readers.OllamaReader(model)
    readings = json.loads(out_path.read_text()) if out_path.exists() else {}
    for product in json.loads(spec_path.read_text())["products"]:
        if product["key"] in readings:
            continue
        start = time.perf_counter()
        try:
            text = reader.read(str(image_root / product["image"]))
        except RuntimeError as error:
            print("no reading", product["key"], error, flush=True)
            text = ""
        readings[product["key"]] = {"text": text, "seconds": time.perf_counter() - start}
        out_path.write_text(json.dumps(readings, indent=1))
        print(len(readings), product["kind"], round(readings[product["key"]]["seconds"], 1), repr(text[:70]), flush=True)
    print("DONE", len(readings))


if __name__ == "__main__":
    main()

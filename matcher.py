import json
import re
import time
from collections import Counter
from functools import lru_cache
from pathlib import Path

import requests
from rapidfuzz import fuzz

FDA = "https://api.fda.gov/drug"
RXNAV = "https://rxnav.nlm.nih.gov/REST"
DSLD = "https://api.ods.od.nih.gov/dsld/v9"
CACHE = Path(__file__).parent / "cache"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = "label-reader-pilot/0.1"

UNIT = r"(mg|mcg|µg|μg|ug|g|iu|units?)"
NUMBER = r"(\d{1,4}(?:,\d{3})?(?:\.\d+)?)"
NAME_THEN_STRENGTH = re.compile(rf"([a-z][a-z .'\-]{{3,70}}?)[\s.:,(…_]*{NUMBER}\s?{UNIT}\b")
STRENGTH_THEN_NAME = re.compile(rf"{NUMBER}\s?{UNIT}\s+(?:of\s+)?([a-z][a-z .'\-]{{3,40}})")
NDC = re.compile(r"(?<!\d)(\d{4,5})\s?-\s?(\d{3,4})(?:\s?-\s?\d{1,2})?(?!\d)")
LABEL_FIELDS = (
    "drug_interactions",
    "boxed_warning",
    "warnings",
    "warnings_and_cautions",
    "do_not_use",
    "ask_doctor",
    "ask_doctor_or_pharmacist",
    "when_using",
)
MIN_NAME_LEN = 5
FUZZY_ACCEPT = 85


def get_json(url: str, params: dict | None = None) -> dict | None:
    for attempt in range(3):
        resp = SESSION.get(url, params=params, timeout=30)
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 404:
            return None
        time.sleep(1 + attempt)
    return None


@lru_cache(maxsize=1)
def lexicon() -> dict[str, str]:
    path = CACHE / "rxnorm_ingredients.json"
    if path.exists():
        return json.loads(path.read_text())
    CACHE.mkdir(exist_ok=True)
    data = get_json(f"{RXNAV}/allconcepts.json", {"tty": "IN PIN"})
    names = {c["name"].lower(): c["rxcui"] for c in data["minConceptGroup"]["minConcept"]}
    path.write_text(json.dumps(names))
    return names


@lru_cache(maxsize=4096)
def ingredient_for_rxcui(rxcui: str) -> str | None:
    data = get_json(f"{RXNAV}/rxcui/{rxcui}/related.json", {"tty": "IN"})
    groups = (data or {}).get("relatedGroup", {}).get("conceptGroup", [])
    names = [c["name"].lower() for g in groups for c in g.get("conceptProperties", [])]
    return names[0] if len(names) == 1 else None


@lru_cache(maxsize=4096)
def to_ingredient(name: str) -> str | None:
    name = re.sub(r"\s+", " ", name.lower()).strip(" .,-")
    rxcui = lexicon().get(name)
    if rxcui is None:
        data = get_json(f"{RXNAV}/rxcui.json", {"name": name, "search": 2})
        ids = (data or {}).get("idGroup", {}).get("rxnormId", [])
        rxcui = ids[0] if ids else None
    if rxcui is None:
        data = get_json(f"{RXNAV}/approximateTerm.json", {"term": name, "maxEntries": 1})
        cands = (data or {}).get("approximateGroup", {}).get("candidate", [])
        if not cands:
            return None
        found = ingredient_for_rxcui(cands[0]["rxcui"])
        if found and fuzz.partial_ratio(found, name) >= FUZZY_ACCEPT:
            return found
        return None
    return ingredient_for_rxcui(rxcui)


def normalize_unit(unit: str) -> str:
    unit = unit.lower()
    if unit in ("µg", "μg", "ug"):
        return "mcg"
    return "unit" if unit.startswith("unit") else unit


def parse_fda_strength(strength: str) -> tuple[float, str] | None:
    match = re.match(rf"\s*{NUMBER}\s?{UNIT}", strength.lower())
    if not match:
        return None
    return float(match.group(1).replace(",", "")), normalize_unit(match.group(2))


def lexicon_name_in(phrase: str) -> str | None:
    words = re.findall(r"[a-z'\-]+", phrase)
    for size in (4, 3, 2, 1):
        for start in range(len(words) - size, -1, -1):
            chunk = " ".join(words[start : start + size])
            if len(chunk) >= MIN_NAME_LEN and chunk in lexicon():
                return chunk
    return None


def ndc_route(text: str) -> dict | None:
    found = [(m.start(), f"{m.group(1)}-{m.group(2)}") for m in NDC.finditer(text)]
    tagged = [code for pos, code in found if "ndc" in text[max(0, pos - 8) : pos].lower()]
    for code in dict.fromkeys(tagged + [code for _, code in found]):
        data = get_json(f"{FDA}/ndc.json", {"search": f'product_ndc:"{code}"', "limit": 1})
        actives = ((data or {}).get("results") or [{}])[0].get("active_ingredients") or []
        items = []
        for active in actives:
            strength = parse_fda_strength(active.get("strength", ""))
            name = to_ingredient(active["name"])
            if strength and name:
                items.append({"ingredient": name, "value": strength[0], "unit": strength[1]})
        if items and len(items) == len(actives):
            return {"route": "ndc", "product_ndc": code, "items": items}
    return None


def confirmed(ingredient: str, is_supplement: bool) -> bool:
    if is_supplement:
        data = get_json(f"{DSLD}/search-filter", {"q": ingredient, "size": 1})
        return bool((data or {}).get("hits"))
    data = get_json(f"{FDA}/ndc.json", {"search": f'active_ingredients.name:"{ingredient}"', "limit": 1})
    return bool((data or {}).get("results"))


def text_route(text: str) -> dict:
    lowered = text.lower()
    is_supplement = "supplement facts" in lowered or "dietary supplement" in lowered
    votes: dict[str, Counter] = {}
    order: list[str] = []

    def add(phrase: str, number: str, unit: str) -> None:
        name = lexicon_name_in(phrase)
        ingredient = to_ingredient(name) if name else to_ingredient(" ".join(phrase.split()[-3:]))
        if ingredient is None:
            return
        if ingredient not in votes:
            votes[ingredient] = Counter()
            order.append(ingredient)
        votes[ingredient][(float(number.replace(",", "")), normalize_unit(unit))] += 1

    for match in NAME_THEN_STRENGTH.finditer(lowered):
        add(match.group(1), match.group(2), match.group(3))
    if not votes:
        for match in STRENGTH_THEN_NAME.finditer(lowered):
            add(match.group(3), match.group(1), match.group(2))
    items = []
    for ingredient in order:
        if not confirmed(ingredient, is_supplement):
            continue
        (value, unit), _ = votes[ingredient].most_common(1)[0]
        items.append({"ingredient": ingredient, "value": value, "unit": unit})
    return {"route": "text", "product_ndc": None, "items": items}


def match(text: str) -> dict:
    return ndc_route(text) or text_route(text)


@lru_cache(maxsize=256)
def label_warning_text(product_ndc: str | None, ingredients: tuple[str, ...]) -> str:
    if product_ndc:
        query = f'openfda.product_ndc:"{product_ndc}"'
    else:
        query = " AND ".join(f'openfda.generic_name:"{name}"' for name in ingredients)
    data = get_json(f"{FDA}/label.json", {"search": query, "limit": 1})
    record = ((data or {}).get("results") or [{}])[0]
    return " ".join(" ".join(record.get(field, [])) for field in LABEL_FIELDS).lower()


def pair_flags(first: dict, second: dict) -> list[dict]:
    names_a = {i["ingredient"] for i in first["items"]}
    names_b = {i["ingredient"] for i in second["items"]}
    flags = [{"type": "duplicate", "ingredient": name} for name in sorted(names_a & names_b)]
    for source, source_names, other_names in ((first, names_a, names_b), (second, names_b, names_a)):
        if not source_names:
            continue
        text = label_warning_text(source["product_ndc"], tuple(sorted(source_names)))
        for name in sorted(other_names - source_names):
            hit = re.search(rf"[^.]*\b{re.escape(name)}\b[^.]*\.", text)
            if hit:
                flags.append({"type": "interaction", "ingredient": name, "quote": hit.group(0).strip()[:300]})
    return flags

import json
import re
import zipfile
from functools import lru_cache
from pathlib import Path

import matcher

HERE = Path(__file__).parent
NDC_TABLE = HERE / "data" / "drug-ndc.json.zip"
NAME_CACHE = HERE / "cache" / "ingredient_names.json"
CODE_LINE = re.compile(r"^NDC\s+(.+)$", re.IGNORECASE)
HYPHENATED = re.compile(r"^(\d{4,5})-(\d{3,4})(?:-\d{1,2})?$")
READ_LINE = re.compile(rf"^(.*?)\s+{matcher.NUMBER}\s*{matcher.UNIT}\b", re.IGNORECASE)
TEN_DIGIT_SPLITS = ((4, 4), (5, 3), (5, 4))
MIN_NAME_TOKEN = 4
NAME_STOPWORDS = {"tablets", "tablet", "capsules", "capsule", "caplets", "usp", "extra", "strength", "relief", "maximum"}

Fact = tuple[str, float, str]


@lru_cache(maxsize=1)
def ndc_table() -> dict:
    with zipfile.ZipFile(NDC_TABLE) as archive:
        records = json.loads(archive.read(archive.namelist()[0]))["results"]
    by_code: dict[str, dict] = {}
    by_word: dict[str, list[dict]] = {}
    for record in records:
        if not record.get("finished") or not record.get("active_ingredients"):
            continue
        by_code[record["product_ndc"]] = record
        words = name_words(f"{record.get('brand_name', '')} {record.get('generic_name', '')}")
        for word in words:
            by_word.setdefault(word, []).append(record)
    return {"by_code": by_code, "by_word": by_word}


def name_words(text: str) -> set[str]:
    words = re.findall(r"[a-z]+", text.lower())
    return {w for w in words if len(w) >= MIN_NAME_TOKEN and w not in NAME_STOPWORDS}


@lru_cache(maxsize=1)
def _name_cache() -> dict[str, str | None]:
    return json.loads(NAME_CACHE.read_text()) if NAME_CACHE.exists() else {}


def base_name(raw: str) -> str | None:
    key = re.sub(r"\s+", " ", raw.lower()).strip(" .,-")
    cache = _name_cache()
    if key not in cache:
        cache[key] = matcher.to_ingredient(key)
        NAME_CACHE.parent.mkdir(exist_ok=True)
        NAME_CACHE.write_text(json.dumps(cache))
    return cache[key]


def official_facts(record: dict) -> frozenset[Fact] | None:
    facts = set()
    for active in record["active_ingredients"]:
        strength = matcher.parse_fda_strength(active.get("strength", ""))
        name = base_name(active["name"])
        if strength is None or name is None:
            return None
        facts.add((name, strength[0], strength[1]))
    return frozenset(facts)


def code_candidates(code_text: str) -> list[str]:
    compact = code_text.strip().replace(" ", "")
    hyphenated = HYPHENATED.match(compact)
    if hyphenated:
        return [f"{hyphenated.group(1)}-{hyphenated.group(2)}"]
    digits = re.sub(r"\D", "", compact)
    if len(digits) == 12 and digits.startswith("3"):
        digits = digits[1:11]
    elif len(digits) == 11:
        return [f"{digits[:5].lstrip('0') or '0'}-{digits[5:9]}", f"{digits[:5]}-{digits[5:9].lstrip('0') or '0'}", f"{digits[:5]}-{digits[5:9]}"]
    if len(digits) != 10:
        return []
    return [f"{digits[:a]}-{digits[a:a + b]}" for a, b in TEN_DIGIT_SPLITS]


def parse_reading(text: str) -> dict:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    codes = [m.group(1) for line in lines if (m := CODE_LINE.match(line))]
    rest = [line for line in lines if not CODE_LINE.match(line)]
    facts, unparsed = set(), 0
    for line in rest[1:]:
        match = READ_LINE.match(line)
        name = base_name(match.group(1)) if match else None
        if match is None or name is None:
            unparsed += 1
            continue
        facts.add((name, float(match.group(2).replace(",", "")), matcher.normalize_unit(match.group(3))))
    return {"code": codes[0] if codes else None, "name": rest[0] if rest else "", "facts": frozenset(facts), "unparsed": unparsed}


def records_for_code(code_text: str | None) -> list[dict]:
    if not code_text:
        return []
    table = ndc_table()["by_code"]
    return [table[code] for code in code_candidates(code_text) if code in table]


def records_for_name(name: str) -> list[dict]:
    words = name_words(name)
    if not words:
        return []
    by_word = ndc_table()["by_word"]
    rarest = min(words, key=lambda word: len(by_word.get(word, [])))
    return [
        record
        for record in by_word.get(rarest, [])
        if words <= name_words(f"{record.get('brand_name', '')} {record.get('generic_name', '')}")
    ]


def facts_the_name_pins_down(name: str) -> frozenset[Fact] | None:
    distinct = {official_facts(record) for record in records_for_name(name)}
    return next(iter(distinct)) if len(distinct) == 1 else None


def verify(text: str) -> dict:
    reading = parse_reading(text)
    read_facts = reading["facts"]
    clean_read = bool(read_facts) and reading["unparsed"] == 0
    coded = [(record, facts) for record in records_for_code(reading["code"]) if (facts := official_facts(record))]
    by_code = [facts for _, facts in coded]
    if by_code:
        if clean_read and read_facts in by_code:
            agreed = next(record for record, facts in coded if facts == read_facts)
            return {"status": "verified", "by": "code_and_text", "facts": sorted(read_facts), "product_ndc": agreed["product_ndc"]}
        return {
            "status": "check",
            "by": "code_only",
            "facts": sorted(by_code[0]),
            "read": sorted(read_facts),
            "product_ndc": coded[0][0]["product_ndc"],
        }
    if not clean_read:
        return {"status": "unreadable" if not read_facts else "check", "by": "text_only", "facts": sorted(read_facts)}
    if facts_the_name_pins_down(reading["name"]) == read_facts:
        named = records_for_name(reading["name"])[0]
        return {"status": "verified", "by": "name_and_text", "facts": sorted(read_facts), "product_ndc": named["product_ndc"]}
    return {"status": "check", "by": "text_only", "facts": sorted(read_facts)}

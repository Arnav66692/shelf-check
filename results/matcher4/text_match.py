import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy import sparse

NGRAMS = (3, 4, 5)
NUMBER = re.compile(r"\d+(?:\.\d+)?")


def normalize(text: str) -> str:
    text = text.upper().replace("|", "I")
    return re.sub(r"[^A-Z0-9.%]+", " ", text).strip()


def grams(text: str) -> set[str]:
    out = set()
    for word in normalize(text).split():
        padded = f" {word} "
        for n in NGRAMS:
            out.update(padded[i : i + n] for i in range(max(1, len(padded) - n + 1)))
    return out


def numbers(text: str) -> set[str]:
    return {n.rstrip("0").rstrip(".") if "." in n else n for n in NUMBER.findall(normalize(text))}


def product_key(row: dict) -> str:
    parts = []
    for product in row["products"]:
        parts.append(product["name"])
        for active in product["actives"]:
            parts.append(f"{active['name']} {active['value']} {active['unit']}")
    return " ".join(parts)


LENGTH_PENALTY = 0.03


@dataclass(frozen=True)
class TextIndex:
    vocab: dict
    idf: np.ndarray
    ocr_docs: sparse.csr_matrix
    key_docs: sparse.csr_matrix
    key_numbers: list
    union_docs: sparse.csr_matrix
    log_length: np.ndarray


def _binary(texts: list[str], vocab: dict) -> sparse.csr_matrix:
    rows, cols = [], []
    for r, text in enumerate(texts):
        for g in grams(text):
            c = vocab.get(g)
            if c is not None:
                rows.append(r)
                cols.append(c)
    return sparse.csr_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(len(texts), len(vocab)))


def build(index: list[dict], ocr_by_image: dict) -> TextIndex:
    ocr_texts = [" ".join(ocr_by_image.get(image, "") for image in row["images"]) for row in index]
    key_texts = [product_key(row) for row in index]
    vocab: dict = {}
    for text in ocr_texts + key_texts:
        for g in grams(text):
            vocab.setdefault(g, len(vocab))
    ocr_docs = _binary(ocr_texts, vocab)
    key_docs = _binary(key_texts, vocab)
    df = np.asarray(((ocr_docs + key_docs) > 0).sum(axis=0)).ravel()
    idf = np.log((len(index) + 1) / (df + 1)) + 1
    union = ((ocr_docs + key_docs) > 0).astype(np.float32).tocsr()
    log_length = np.log(np.asarray(union.multiply(idf[None, :]).sum(axis=1)).ravel() + 1).astype(np.float32)
    return TextIndex(vocab, idf.astype(np.float32), ocr_docs, key_docs, [numbers(t) for t in key_texts], union, log_length)


def text_score(ti: TextIndex, query_texts: list[str]) -> np.ndarray:
    q = _binary(query_texts, ti.vocab).multiply(ti.idf[None, :]).tocsr()
    mass = np.asarray(q.sum(axis=1)).ravel()
    has_text = mass > 0
    mass[~has_text] = 1
    cover = np.asarray((q @ ti.union_docs.T).todense()) / mass[:, None]
    return np.where(has_text[:, None], cover - LENGTH_PENALTY * ti.log_length[None, :], 0).astype(np.float32)


def scores(ti: TextIndex, query_texts: list[str]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    q = _binary(query_texts, ti.vocab).multiply(ti.idf[None, :]).tocsr()
    mass = np.asarray(q.sum(axis=1)).ravel()
    mass[mass == 0] = 1
    ocr = np.asarray((q @ ti.ocr_docs.T).todense()) / mass[:, None]
    key = np.asarray((q @ ti.key_docs.T).todense()) / mass[:, None]
    num = np.zeros_like(ocr)
    for i, text in enumerate(query_texts):
        found = {n for n in numbers(text) if len(n.replace(".", "")) >= 1 and n not in {"0", "1"}}
        if found:
            for j, key_nums in enumerate(ti.key_numbers):
                if found & key_nums:
                    num[i, j] = len(found & key_nums) / len(found)
    return ocr, key, num


def load_ocr(path: Path, strip_prefix: str = "") -> dict:
    out = {}
    for line in path.read_text().splitlines():
        r = json.loads(line)
        out[r["path"].split(strip_prefix, 1)[-1] if strip_prefix else r["path"]] = " ".join(x["text"] for x in r["lines"])
    return out

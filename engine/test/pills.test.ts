import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  findPills,
  MAX_PILL_CANDIDATES,
  MIN_IMPRINT_LENGTH,
  normaliseImprint,
  parsePillFile,
  PILL_GUESS_NOTICE,
  PillFileShapeError,
  withinOneEdit,
} from "../src/pills.ts";
import type { PillCandidate, PillFile, PillQuery, PillRecord } from "../src/pills.ts";

const PILLS_PATH = fileURLToPath(new URL("../data/pills.json", import.meta.url));
const FILE: PillFile = parsePillFile(JSON.parse(readFileSync(PILLS_PATH, "utf8")));
const RECORDS = FILE.records;

const SAMPLE_SIZE = 200;
const SAMPLE_SEED = 20261121;
const TOP = 5;
const EXACT_BAR = 190;
const IMPRINT_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function onlyRecord(ndc: string): PillRecord {
  const found = RECORDS.filter((record) => record.ndc === ndc);
  if (found.length !== 1 || found[0] === undefined) throw new Error(`expected one record for ${ndc}, found ${found.length}`);
  return found[0];
}

function listed(candidate: PillCandidate): readonly PillRecord[] {
  return [candidate.product, ...candidate.sameLook];
}

function inTop(candidates: readonly PillCandidate[], target: PillRecord, top: number): boolean {
  return candidates
    .slice(0, top)
    .some((candidate) => listed(candidate).some((record) => record.ndc === target.ndc && record.part === target.part));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function sample<T>(items: readonly T[], size: number, random: () => number): readonly T[] {
  const pool = [...items];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap] as T, pool[index] as T];
  }
  return pool.slice(0, size);
}

function queryFor(record: PillRecord, imprint: string): PillQuery {
  return {
    imprint,
    ...(record.colors[0] === undefined ? {} : { color: record.colors[0] }),
    ...(record.shape === "" ? {} : { shape: record.shape }),
  };
}

function oneCharacterChanged(imprint: string, random: () => number): string {
  const key = normaliseImprint(imprint);
  const position = Math.floor(random() * key.length);
  const others = IMPRINT_CHARACTERS.replace(key[position] ?? "", "");
  const replacement = others[Math.floor(random() * others.length)] ?? "";
  return `${key.slice(0, position)}${replacement}${key.slice(position + 1)}`;
}

describe("normaliseImprint", () => {
  test("upper-cases, drops spaces and the semicolons SPL puts between sides, keeps letters and digits", () => {
    expect(normaliseImprint("5892;V")).toBe("5892V");
    expect(normaliseImprint("m 367")).toBe("M367");
    expect(normaliseImprint(" par;129 ")).toBe("PAR129");
    expect(normaliseImprint("A-1/2.5")).toBe("A125");
    expect(normaliseImprint(" ; ")).toBe("");
  });
});

describe("withinOneEdit", () => {
  test("accepts one swap, one insert or one delete and rejects two", () => {
    expect(withinOneEdit("M367", "M367")).toBe(true);
    expect(withinOneEdit("M367", "M357")).toBe(true);
    expect(withinOneEdit("M367", "M3677")).toBe(true);
    expect(withinOneEdit("M367", "367")).toBe(true);
    expect(withinOneEdit("M367", "N357")).toBe(false);
    expect(withinOneEdit("M367", "M36")).toBe(true);
    expect(withinOneEdit("M367", "M3")).toBe(false);
  });
});

describe("parsePillFile", () => {
  test("rejects a file that is not the pill format", () => {
    expect(() => parsePillFile([])).toThrow(PillFileShapeError);
    expect(() => parsePillFile({ fields: ["ndc"], sources: [], records: [] })).toThrow(PillFileShapeError);
  });

  test("the built file says where each record came from and when", () => {
    expect(FILE.sources.map((source) => source.id)).toEqual(["dailymed", "pillbox"]);
    expect(FILE.sources.reduce((total, source) => total + source.records, 0)).toBe(RECORDS.length);
    expect(RECORDS.every((record) => /^\d{4}-\d{2}-\d{2}$/.test(record.date))).toBe(true);
  });
});

describe("findPills ranking", () => {
  const temazepam = onlyRecord("0603-5892");

  test("an exact imprint, typed with spaces and either side first, ranks the real product first", () => {
    for (const imprint of ["5892 V", "v 5892", "5892v"]) {
      const [first] = findPills({ imprint, color: "PINK", shape: "CAPSULE" }, RECORDS);
      expect(first?.match).toBe("exact_imprint");
      expect(first && listed(first).map((record) => record.ndc)).toContain(temazepam.ndc);
    }
  });

  test("exact matches come before one-character differences, which are marked close imprint", () => {
    const candidates = findPills({ imprint: "5892V", shape: "CAPSULE" }, RECORDS);
    const firstClose = candidates.findIndex((candidate) => candidate.match === "close_imprint");
    const lastExact = candidates.map((candidate) => candidate.match).lastIndexOf("exact_imprint");
    expect(lastExact).toBeGreaterThanOrEqual(0);
    if (firstClose >= 0) expect(firstClose).toBeGreaterThan(lastExact);

    const close = findPills({ imprint: "5893V", color: "PINK", shape: "CAPSULE" }, RECORDS);
    const found = close.find((candidate) => listed(candidate).some((record) => record.ndc === temazepam.ndc));
    expect(found?.match).toBe("close_imprint");
    expect(found?.reason).toContain("one character away");
  });

  test("colour and shape filter out records that disagree and lift the ones that agree", () => {
    const pinkOnly = findPills({ imprint: "5892V", color: "PINK" }, RECORDS);
    expect(pinkOnly.length).toBeGreaterThan(0);
    for (const candidate of pinkOnly) {
      for (const record of listed(candidate)) {
        expect(record.colors.length === 0 || record.colors.includes("PINK")).toBe(true);
      }
    }
    expect(findPills({ imprint: "5892V", color: "GREEN", shape: "CAPSULE" }, RECORDS).some((candidate) =>
      listed(candidate).some((record) => record.ndc === temazepam.ndc),
    )).toBe(false);

    const plain = findPills({ imprint: "5892V" }, RECORDS).find((candidate) => candidate.product.ndc === temazepam.ndc);
    const described = findPills({ imprint: "5892V", color: "PINK", shape: "CAPSULE" }, RECORDS).find(
      (candidate) => candidate.product.ndc === temazepam.ndc,
    );
    expect(plain && described && described.score > plain.score).toBe(true);
  });

  test("returns nothing for an imprint under two characters unless colour and shape are both given", () => {
    expect(MIN_IMPRINT_LENGTH).toBe(2);
    expect(findPills({ imprint: "" }, RECORDS)).toEqual([]);
    expect(findPills({ imprint: "I", color: "ORANGE" }, RECORDS)).toEqual([]);
    const both = findPills({ imprint: "", color: "ORANGE", shape: "ROUND" }, RECORDS);
    expect(both.length).toBeGreaterThan(0);
    expect(both.every((candidate) => candidate.product.colors.includes("ORANGE") && candidate.product.shape === "ROUND")).toBe(true);
  });

  test("returns at most 20 candidates, each with the guess line and never the word safe", () => {
    const candidates = findPills({ imprint: "I2" }, RECORDS);
    expect(candidates.length).toBeLessThanOrEqual(MAX_PILL_CANDIDATES);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.notice).toBe(PILL_GUESS_NOTICE);
      expect(`${candidate.notice} ${candidate.reason}`.toLowerCase()).not.toContain("safe");
    }
    expect(PILL_GUESS_NOTICE).toBe(
      "Educated guess from the imprint, colour and shape. Pills that look alike can be different medicines.",
    );
  });

  test("products that look the same and hold the same medicine and strength are listed together", () => {
    const [first] = findPills({ imprint: "I2", color: "ORANGE", shape: "ROUND" }, RECORDS);
    expect(first).toBeDefined();
    const strengths = new Set(listed(first as PillCandidate).map((record) => record.strength.toUpperCase()));
    expect(strengths.size).toBe(1);
  });
});

describe("check on 200 sampled records (queries come from the same records, so this is partly circular)", () => {
  const random = seededRandom(SAMPLE_SEED);
  const withImprint = RECORDS.filter((record) => normaliseImprint(record.imprint).length >= MIN_IMPRINT_LENGTH);
  const picked = sample(withImprint, SAMPLE_SIZE, random);

  test(`(a) exact imprint plus its colour and shape puts the right product NDC in the top ${TOP} at least ${EXACT_BAR} of ${SAMPLE_SIZE} times`, () => {
    const found = picked.filter((record) => inTop(findPills(queryFor(record, record.imprint), RECORDS), record, TOP)).length;
    console.log(`(a) exact imprint: right product NDC in top ${TOP} for ${found} of ${picked.length}. Bar: ${EXACT_BAR}.`);
    expect(picked).toHaveLength(SAMPLE_SIZE);
    expect(found).toBeGreaterThanOrEqual(EXACT_BAR);
  });

  test(`(b) one imprint character changed, reported without a bar`, () => {
    const found = picked.filter((record) =>
      inTop(findPills(queryFor(record, oneCharacterChanged(record.imprint, random)), RECORDS), record, TOP),
    ).length;
    console.log(`(b) one character changed: right product NDC in top ${TOP} for ${found} of ${picked.length}. No bar.`);
    expect(picked).toHaveLength(SAMPLE_SIZE);
  });
});

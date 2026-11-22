import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  findRecalls,
  findRecallsByText,
  NAME_MATCH_NOTICE,
  parseRecallFile,
  recallCoverageNote,
  RecallFileShapeError,
} from "../src/recalls.ts";
import type { RecallFile, RecallRecord } from "../src/recalls.ts";
import type { CabinetItem } from "../src/types.ts";
import { loadCabinet, loadSupplements } from "./support/cabinet.ts";

const RECALLS_PATH = fileURLToPath(new URL("../data/recalls.json", import.meta.url));
const RAW_FILE: unknown = JSON.parse(readFileSync(RECALLS_PATH, "utf8"));
const FILE: RecallFile = parseRecallFile(RAW_FILE);

function dates(matches: readonly { readonly recall: RecallRecord }[]): readonly string[] {
  return matches.map((match) => match.recall.initiationDate);
}

function newestFirst(values: readonly string[]): readonly string[] {
  return [...values].sort().reverse();
}

describe("the built recall file", () => {
  test("holds every record of the FDA file and says how many carry a product NDC", () => {
    expect(FILE.recalls).toHaveLength(18166);
    expect(FILE.source).toEqual({
      url: "https://download.open.fda.gov/drug/enforcement/drug-enforcement-0001-of-0001.json.zip",
      lastUpdated: "2026-11-19",
      records: 18166,
      recordsWithProductNdc: 3276,
    });
    expect(FILE.recalls.filter((recall) => recall.productNdcs.length > 0)).toHaveLength(3276);
  });

  test("the coverage note gives the real counts and does not call a product safe", () => {
    const note = recallCoverageNote(FILE.source);

    expect(note).toContain("3276 of the 18166 FDA drug recall records");
    expect(note).toContain("No match does not mean the product is safe.");
  });
});

describe("parseRecallFile", () => {
  test("rejects a file without a source block or a recalls array", () => {
    expect(() => parseRecallFile([])).toThrow(RecallFileShapeError);
    expect(() => parseRecallFile({ recalls: [] })).toThrow(RecallFileShapeError);
    expect(() => parseRecallFile({ source: FILE.source })).toThrow(RecallFileShapeError);
  });

  test("rejects a record with an unknown classification or a date that is not YYYY-MM-DD", () => {
    const source = { url: "u", last_updated: "2026-11-19", records: 1, records_with_product_ndc: 0 };
    const record = {
      recall_number: "D-0200-2024",
      classification: "Class II",
      status: "Terminated",
      reason_for_recall: "r",
      product_description: "p",
      code_info: "c",
      recalling_firm: "f",
      recall_initiation_date: "2022-01-26",
      report_date: "2024-01-03",
      product_ndcs: ["0093-1720"],
    };

    expect(parseRecallFile({ source, recalls: [record] }).recalls[0]?.recallNumber).toBe("D-0200-2024");
    expect(() => parseRecallFile({ source, recalls: [{ ...record, classification: "Class IV" }] })).toThrow(RecallFileShapeError);
    expect(() => parseRecallFile({ source, recalls: [{ ...record, report_date: "20240103" }] })).toThrow(RecallFileShapeError);
  });
});

describe("findRecalls", () => {
  test("the recorded warfarin product 0093-1720 has two real Class II recalls, matched by product NDC", async () => {
    const [warfarin] = await loadCabinet("warfarin");
    if (warfarin === undefined) throw new Error("fixture missing");

    const matches = findRecalls(warfarin, FILE.recalls);

    expect(matches.map((match) => match.recall.recallNumber).sort()).toEqual(["D-0200-2024", "D-0201-2024"]);
    for (const match of matches) {
      expect(match.match).toBe("product_ndc");
      expect(match.matchedNdc).toBe("0093-1720");
      expect(match.recall.productNdcs).toContain("0093-1720");
      expect(match.recall).toMatchObject({
        classification: "Class II",
        status: "Terminated",
        recallingFirm: "CARDINAL HEALTHCARE",
        initiationDate: "2022-01-26",
        reportDate: "2024-01-03",
      });
    }
  });

  test("the recorded Tylenol product 50580-590 has no recall record", async () => {
    const [tylenol] = await loadCabinet("tylenol");
    if (tylenol === undefined) throw new Error("fixture missing");

    expect(findRecalls(tylenol, FILE.recalls)).toEqual([]);
  });

  test("an item without a product NDC is never matched, even when its name appears in recalls", async () => {
    const [warfarin] = await loadCabinet("warfarin");
    const supplements = await loadSupplements("melatonin");
    if (warfarin === undefined) throw new Error("fixture missing");
    const { productNdc: _productNdc, ...nameOnly } = warfarin;
    const unnamed: CabinetItem = { ...nameOnly, displayName: "Warfarin Sodium Tablets" };

    expect(findRecallsByText("warfarin", FILE.recalls).length).toBeGreaterThan(0);
    expect(findRecalls(unnamed, FILE.recalls)).toEqual([]);
    expect(supplements.flatMap((item) => findRecalls(item, FILE.recalls))).toEqual([]);
  });

  test("a product with many recalls gets them newest first", () => {
    const busiest: CabinetItem = { id: "x", displayName: "x", productNdc: "68968-5552", kind: "rx", ingredients: [], verified: true };

    const matches = findRecalls(busiest, FILE.recalls);

    expect(matches).toHaveLength(42);
    expect(dates(matches)).toEqual(newestFirst(dates(matches)));
  });
});

describe("findRecallsByText", () => {
  test("BPC-157 gives real recall records typed as a name match, newest first", () => {
    const matches = findRecallsByText("BPC-157", FILE.recalls);

    expect(matches).toHaveLength(9);
    expect(matches[0]?.recall.recallNumber).toBe("D-0120-2027");
    expect(dates(matches)).toEqual(newestFirst(dates(matches)));
    for (const match of matches) {
      expect(match.match).toBe("name_match_not_your_vial");
      expect(match.notice).toBe(NAME_MATCH_NOTICE);
      expect(match.matchedText).toMatch(/^BPC[\s-]?157$/i);
      expect(match.recall.productDescription).toContain(match.matchedText);
    }
  });

  test("the notice says it is a name match and not a match to the vial", () => {
    expect(NAME_MATCH_NOTICE).toContain("Name match, not a match to your vial.");
  });

  test("only whole words match: morphine does not match hydromorphone", () => {
    const matches = findRecallsByText("morphine", FILE.recalls);
    const containing = FILE.recalls.filter((recall) => /morphine/i.test(recall.productDescription));

    expect(matches).toHaveLength(189);
    expect(containing).toHaveLength(191);
    expect(new Set(matches.map((match) => match.matchedText.toLowerCase()))).toEqual(new Set(["morphine"]));
  });

  test("a peptide with no recall record and a blank term give nothing", () => {
    expect(findRecallsByText("epitalon", FILE.recalls)).toEqual([]);
    expect(findRecallsByText("  ", FILE.recalls)).toEqual([]);
  });
});

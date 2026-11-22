import { describe, expect, test } from "vitest";
import { checkCabinet, DuplicateItemIdError } from "../src/index.ts";
import { expectVerbatim, flagsOfType, loadCabinet } from "./support/cabinet.ts";

describe("checkCabinet", () => {
  test("Tylenol plus NyQuil gives one duplicate flag and one daily total flag for acetaminophen", async () => {
    const items = await loadCabinet("tylenol", "nyquil");

    const flags = checkCabinet(items, { ageYears: 35, conditions: [], allergies: [] });

    expect(flags.map((flag) => flag.type)).toEqual(["duplicate_ingredient", "daily_total"]);
    expect(flagsOfType(flags, "daily_total")[0]?.numbers?.["totalMgPerDayAtEachMaximum"]).toBe(5600);
  });

  test("Benadryl plus Tylenol PM gives a diphenhydramine duplicate", async () => {
    const items = await loadCabinet("benadryl", "tylenolPm");

    const duplicates = flagsOfType(checkCabinet(items), "duplicate_ingredient");

    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.title).toContain("diphenhydramine");
  });

  test("loratadine plus Tylenol gives no flags at all", async () => {
    const items = await loadCabinet("loratadine", "tylenol");

    expect(checkCabinet(items)).toEqual([]);
  });

  test("an empty cabinet and a single product give no flags", async () => {
    const items = await loadCabinet("warfarin");

    expect(checkCabinet([])).toEqual([]);
    expect(checkCabinet(items)).toEqual([]);
  });

  test("flags come back with stop first, then ask, then info", async () => {
    const items = await loadCabinet("warfarin", "aspirin", "tylenol", "nyquil", "benadryl", "tylenolPm");
    const rank = { stop: 0, ask: 1, info: 2 } as const;

    const ranks = checkCabinet(items).map((flag) => rank[flag.severity]);

    expect(ranks).toContain(0);
    expect(ranks).toContain(1);
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  test("every quote on every flag is found word for word in the label it names", async () => {
    const items = await loadCabinet(
      "tylenol",
      "nyquil",
      "benadryl",
      "tylenolPm",
      "aspirin",
      "warfarin",
      "lisinoprilHctz",
      "sertraline",
      "ibuprofen",
      "loratadine",
    );

    const flags = checkCabinet(items, { ageYears: 35, conditions: [], allergies: [] });

    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expectVerbatim(flag.quote, items);
      for (const quote of flag.supportingQuotes ?? []) expectVerbatim(quote, items);
    }
  });

  test("the input cabinet is not changed", async () => {
    const items = await loadCabinet("tylenol", "nyquil");
    const before = JSON.stringify(items);

    checkCabinet(items);

    expect(JSON.stringify(items)).toBe(before);
  });

  test("rejects two items with the same id", async () => {
    const [tylenol] = await loadCabinet("tylenol");
    if (tylenol === undefined) throw new Error("fixture missing");

    expect(() => checkCabinet([tylenol, tylenol])).toThrow(DuplicateItemIdError);
  });
});

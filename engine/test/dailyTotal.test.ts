import { describe, expect, test } from "vitest";
import { dailyTotalFlags, labelledCeiling, labelledMaximum } from "../src/flags/dailyTotal.ts";
import type { CabinetItem, Ingredient } from "../src/types.ts";
import { expectVerbatim, loadCabinet, withoutLabel } from "./support/cabinet.ts";
import type { ProductId } from "./support/cabinet.ts";

function ingredientOf(item: CabinetItem | undefined, name: string): Ingredient {
  const ingredient = item?.ingredients.find((candidate) => candidate.name === name);
  if (item === undefined || ingredient === undefined) throw new Error(`Test cabinet has no ${name}`);
  return ingredient;
}

async function maximumFor(id: ProductId, ingredientName: string) {
  const [item] = await loadCabinet(id);
  if (item === undefined) throw new Error(`Test cabinet has no ${id}`);
  return labelledMaximum(item, ingredientOf(item, ingredientName));
}

describe("labelled daily maximum", () => {
  test("Tylenol Extra Strength: 6 tablets of 500 mg is 3000 mg", async () => {
    const maximum = await maximumFor("tylenol", "acetaminophen");

    expect(maximum).toMatchObject({ status: "parsed", mgPerDay: 3000 });
    expect(maximum.status === "parsed" && maximum.limit.matchedText).toBe("do not take more than 6 tablets in 24 hours");
  });

  test("NyQuil: 4 doses of 30 mL at 650 mg per 30 mL is 2600 mg", async () => {
    const maximum = await maximumFor("nyquil", "acetaminophen");

    expect(maximum).toMatchObject({ status: "parsed", mgPerDay: 2600 });
    expect(maximum.status === "parsed" && maximum.limit.matchedText).toBe("do not exceed 4 doses per 24 hrs");
    expect(maximum.status === "parsed" && maximum.doseSize?.matchedText).toBe("30 mL per dose");
  });

  test("Benadryl liquid: 6 doses of up to 20 mL at 12.5 mg per 5 mL is 300 mg", async () => {
    const maximum = await maximumFor("benadryl", "diphenhydramine");

    expect(maximum).toMatchObject({ status: "parsed", mgPerDay: 300 });
    expect(maximum.status === "parsed" && maximum.doseSize?.value).toBe(20);
  });

  test("reads the other label wordings in the fixtures", async () => {
    expect(await maximumFor("tylenolPm", "diphenhydramine")).toMatchObject({ status: "parsed", mgPerDay: 50 });
    expect(await maximumFor("aspirin", "aspirin")).toMatchObject({ status: "parsed", mgPerDay: 3900 });
    expect(await maximumFor("ibuprofen", "ibuprofen")).toMatchObject({ status: "parsed", mgPerDay: 1200 });
    expect(await maximumFor("loratadine", "loratadine")).toMatchObject({ status: "parsed", mgPerDay: 10 });
  });

  test("says so when a prescription label prints no daily maximum sentence", async () => {
    const maximum = await maximumFor("warfarin", "warfarin");

    expect(maximum.status).toBe("not_parsed");
  });

  test("finds the 4,000 mg acetaminophen warning on the Tylenol label and none on NyQuil", async () => {
    const [tylenol, nyquil] = await loadCabinet("tylenol", "nyquil");
    if (tylenol === undefined || nyquil === undefined) throw new Error("fixtures missing");

    expect(labelledCeiling(tylenol, "acetaminophen")?.mgPerDay).toBe(4000);
    expect(labelledCeiling(nyquil, "acetaminophen")).toBeUndefined();
  });
});

describe("daily total flag", () => {
  test("Tylenol plus NyQuil reports each maximum, the lowest and the combined total", async () => {
    const items = await loadCabinet("tylenol", "nyquil");

    const flags = dailyTotalFlags(items);

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "daily_total", severity: "stop", itemIds: ["tylenol", "nyquil"] });
    expect(flags[0]?.numbers).toEqual({
      "maxMgPerDay.tylenol": 3000,
      "maxMgPerDay.nyquil": 2600,
      lowestMaxMgPerDay: 2600,
      totalMgPerDayAtEachMaximum: 5600,
      labelWarningMgPerDay: 4000,
    });
  });

  test("quotes come word for word from the labels and include both products", async () => {
    const items = await loadCabinet("tylenol", "nyquil");

    const [flag] = dailyTotalFlags(items);

    expect(flag?.quote?.itemId).toBe("nyquil");
    expect(flag?.quote?.text).toContain("do not exceed 4 doses per 24 hrs");
    expect(flag?.supportingQuotes?.map((quote) => quote.itemId)).toEqual(["tylenol", "nyquil", "tylenol"]);
    for (const quote of [flag?.quote, ...(flag?.supportingQuotes ?? [])]) expectVerbatim(quote, items);
  });

  test("Benadryl plus Tylenol PM totals 350 mg of diphenhydramine and stays at ask level", async () => {
    const items = await loadCabinet("benadryl", "tylenolPm");

    const [flag] = dailyTotalFlags(items);

    expect(flag?.severity).toBe("ask");
    expect(flag?.numbers).toMatchObject({
      "maxMgPerDay.benadryl": 300,
      "maxMgPerDay.tylenolPm": 50,
      lowestMaxMgPerDay: 50,
      totalMgPerDayAtEachMaximum: 350,
      labelWarningMgPerDay: null,
    });
  });

  test("when one label cannot be read it says so and gives no combined total", async () => {
    const [tylenol, nyquil] = await loadCabinet("tylenol", "nyquil");
    if (tylenol === undefined || nyquil === undefined) throw new Error("fixtures missing");

    const [flag] = dailyTotalFlags([tylenol, withoutLabel(nyquil)]);

    expect(flag?.numbers).toMatchObject({
      "maxMgPerDay.tylenol": 3000,
      "maxMgPerDay.nyquil": null,
      totalMgPerDayAtEachMaximum: null,
    });
    expect(flag?.detail).toContain("no daily maximum could be read from the label");
    expect(flag?.detail).toContain("Nothing was guessed");
  });

  test("no duplicated ingredient means no daily total flag", async () => {
    const items = await loadCabinet("loratadine", "tylenol");

    expect(dailyTotalFlags(items)).toEqual([]);
  });
});

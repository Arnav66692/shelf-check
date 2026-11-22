import { describe, expect, test } from "vitest";
import { dailyTotalFlags, labelledCeiling, labelledMaximum } from "../src/flags/dailyTotal.ts";
import { checkCabinet } from "../src/index.ts";
import type { CabinetItem, Ingredient } from "../src/types.ts";
import { expectVerbatim, loadCabinet, withoutLabel } from "./support/cabinet.ts";
import type { ProductId } from "./support/cabinet.ts";
import judgeLabels from "../fixtures/judges/acetaminophen.json";

function ingredientOf(item: CabinetItem | undefined, name: string): Ingredient {
  const ingredient = item?.ingredients.find((candidate) => candidate.name === name);
  if (item === undefined || ingredient === undefined) throw new Error(`Test cabinet has no ${name}`);
  return ingredient;
}

async function maximumFor(id: ProductId, ingredientName: string) {
  const [item] = await loadCabinet(id);
  if (item === undefined) throw new Error(`Test cabinet has no ${id}`);
  return labelledMaximum(item, ingredientOf(item, ingredientName), adultProfile);
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

    const flags = dailyTotalFlags(items, adultProfile);

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

    const [flag] = dailyTotalFlags(items, adultProfile);

    expect(flag?.quote?.itemId).toBe("nyquil");
    expect(flag?.quote?.text).toContain("do not exceed 4 doses per 24 hrs");
    expect(flag?.supportingQuotes?.map((quote) => quote.itemId)).toEqual(["tylenol", "nyquil", "tylenol"]);
    for (const quote of [flag?.quote, ...(flag?.supportingQuotes ?? [])]) expectVerbatim(quote, items);
  });

  test("Benadryl plus Tylenol PM totals 350 mg of diphenhydramine and stays at ask level", async () => {
    const items = await loadCabinet("benadryl", "tylenolPm");

    const [flag] = dailyTotalFlags(items, adultProfile);

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

    const [flag] = dailyTotalFlags([tylenol, withoutLabel(nyquil)], adultProfile);

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

const adultProfile = { ageYears: 35, conditions: [], allergies: [] };

describe("daily maximum evidence", () => {
  const judgeItem = (id: keyof typeof judgeLabels): CabinetItem => ({ ...judgeLabels[id], kind: "otc", verified: true });

  test("the 5700 mg NyQuil, DayQuil and Excedrin total cites the reference warning", async () => {
    const cabinet = [judgeItem("NyQuil"), judgeItem("DayQuil"), judgeItem("Excedrin")];
    const [flag] = dailyTotalFlags(cabinet, adultProfile);
    expect(flag).toMatchObject({ severity: "stop", numbers: { totalMgPerDayAtEachMaximum: 5700, labelWarningMgPerDay: 4000 } });
    const [reference] = await loadCabinet("tylenol");
    expect(reference?.label?.warnings?.join(" ")).toContain(flag?.source?.text);
    expect(flag?.source?.sourceUrl).toContain("api.fda.gov");
    expect(flag?.explain).toContain("reference label");
    expect(flag?.supportingQuotes?.every(q => cabinet.some(item => item.id === q.itemId))).toBe(true);
  });

  test("ZzzQuil Night Pain uses its one-dose direction at the 4000 mg boundary", async () => {
    const [tylenol] = await loadCabinet("tylenol");
    if (!tylenol) throw new Error("missing Tylenol fixture");
    const nightPain = judgeItem("ZzzQuil");
    const [flag] = dailyTotalFlags([tylenol, nightPain], adultProfile);
    expect(flag).toMatchObject({ severity: "ask", numbers: {
      ["maxMgPerDay." + nightPain.id]: 1000, totalMgPerDayAtEachMaximum: 4000, labelWarningMgPerDay: 4000,
    } });
    expect(flag?.source).toBeUndefined();
    expect(flag?.quote?.text).toContain("take only one dose (30 mL) per day");
  });

  test("uses an unconditional do-not-exceed line in Warnings and keeps its source section", () => {
    const item = judgeItem("NyQuil");
    const warnings = ["Warnings • Do not exceed 4 doses per 24 hrs"];
    const check = (directions: string, lines: string[]) => labelledMaximum({
      ...item, label: { warnings: lines, dosage_and_administration: [directions] },
    }, ingredientOf(item, "acetaminophen"), adultProfile);
    expect(check("30 mL per dose", warnings)).toMatchObject({
      status: "parsed", mgPerDay: 2600, limit: { quote: { text: "Do not exceed 4 doses per 24 hrs", section: "warnings" } },
    });
    expect(check("30 mL per dose every 6 hours", warnings)).toMatchObject({ status: "parsed", mgPerDay: 2600 });
    expect(check("30 mL per dose at bedtime", warnings).status).toBe("not_parsed");
    expect(check("30 mL per dose", ["If your doctor directs, do not exceed 4 doses per 24 hrs."]).status).toBe("not_parsed");
    expect(check("30 mL per dose", ["If you have liver disease: • Do not exceed 4 doses per 24 hrs."]).status).toBe("not_parsed");
    for (const lines of [
      ["Do not exceed 4 doses per 24 hrs. Maximum daily dose is 1,000 mg."],
      ["Do not exceed 4 doses per 24 hrs. Take only one per day if using another medicine."],
      ["For children under 6 years:", "Do not exceed 4 doses per 24 hrs."],
    ]) expect(check("30 mL per dose", lines).status).toBe("not_parsed");
    expect(check("30 mL per dose. Do not exceed 2 doses per 24 hrs.", warnings).status).toBe("not_parsed");
  });

  test("a named 4000 mg warning on just one product supplies the combined ceiling", () => {
    const nq = judgeItem("NyQuil");
    const warning = "Do not exceed 4,000 mg of acetaminophen in 24 hours.";
    const [flag] = dailyTotalFlags([{ ...nq, label: { ...nq.label, warnings: [warning] } }, judgeItem("DayQuil")], adultProfile);
    expect(flag).toMatchObject({ severity: "stop", numbers: { totalMgPerDayAtEachMaximum: 5200, labelWarningMgPerDay: 4000 } });
    expect(flag?.source).toBeUndefined();
    expect(flag?.supportingQuotes).toContainEqual({ itemId: nq.id, section: "warnings", text: warning, excerpt: warning });
    expect(labelledCeiling({ ...nq, label: { warnings: [warning.replace("4,000", "500")] } }, "acetaminophen")).toBeUndefined();
  });

  test("uses only the Benadryl dose row for the supplied age", async () => {
    const cabinet = await loadCabinet("benadryl", "tylenolPm");
    const maxAt = (ageYears?: number) => checkCabinet(cabinet, { ...adultProfile, ageYears })
      .find((flag) => flag.type === "daily_total")?.numbers?.["maxMgPerDay.benadryl"];
    expect([maxAt(5), maxAt(6), maxAt(8), maxAt(11.9), maxAt(12), maxAt()]).toEqual([null, 150, 150, 150, 300, null]);
  });

  test("binds each age row to its own daily cap and abstains on weight rows", async () => {
    const [item] = await loadCabinet("benadryl");
    if (!item) throw new Error("fixture missing");
    const dose = (directions: string, ageYears: number) => labelledMaximum(
      { ...item, label: { dosage_and_administration: [directions] } },
      ingredientOf(item, "diphenhydramine"), { ageYears },
    );
    const rows = "Adults and children 12 years and over: 20 mL per dose. Do not exceed 6 doses in 24 hours. Children 6 to 11 years: 5 mL per dose. Do not exceed 4 doses in 24 hours.";
    expect(dose(rows, 8)).toMatchObject({ status: "parsed", mgPerDay: 50 });
    expect(dose(rows, 18)).toMatchObject({ status: "parsed", mgPerDay: 300 });
    expect(dose("Children 6 to 11 years weighing 40 lbs: 5 mL per dose. Do not exceed 4 doses in 24 hours.", 8).status).toBe("not_parsed");
  });

  test("withholds counted maxima with competing or conditional directions", async () => {
    const [item] = await loadCabinet("tylenol");
    if (!item) throw new Error("fixture missing");
    const maximum = (directions: string) => labelledMaximum(
      { ...item, label: { dosage_and_administration: [directions] } },
      { ...ingredientOf(item, "acetaminophen"), value: 100 }, adultProfile,
    );
    for (const directions of [
      "Do not exceed 4 tablets per day. Maximum daily dose is 200 mg.",
      "Adults 12 years and older: do not exceed 8 tablets per day if directed by a doctor. Otherwise take up to 2 tablets.",
      "Adults 12 years and older: 2 tablets. Under 12 years: 1 tablet. Do not exceed 4 doses per day.",
      "Adults 12 years and older: 2 tablets. 6–11: 1 tablet. Do not exceed 4 doses per day.",
      "For patients on dialysis do not exceed 4 tablets per day.",
      "Do not exceed 4 tablets per day. Take only one per day if using another medicine.",
    ]) expect(maximum(directions).status, directions).toBe("not_parsed");
    expect(maximum("Do not exceed 4 tablets per day.")).toMatchObject({ status: "parsed", mgPerDay: 400 });
  });

  test("an NDC salt identity alone does not establish the mass basis", async () => {
    const [item] = await loadCabinet("sertraline");
    if (!item) throw new Error("fixture missing");
    const ingredient = ingredientOf(item, "sertraline");
    expect(ingredient.printedName).toBe("SERTRALINE HYDROCHLORIDE");
    expect(ingredient.strengthBasis).toBeUndefined();
  });

  test("consumes the entire fractional teaspoon quantity", async () => {
    const [item] = await loadCabinet("benadryl");
    if (!item) throw new Error("fixture missing");
    const maximum = (quantity: string) => labelledMaximum(
      { ...item, label: { dosage_and_administration: [`Take ${quantity} teaspoon per dose. Do not exceed 4 doses in 24 hours.`] } },
      { ...ingredientOf(item, "diphenhydramine"), value: 10 },
    );
    expect(maximum("1/2")).toMatchObject({ status: "parsed", mgPerDay: 20 });
    expect(maximum("1 1/2")).toMatchObject({ status: "parsed", mgPerDay: 60 });
    for (const malformed of ["1/0", "1//2", "1/2/3", "1 2", "-2", "half of 2"]) expect(maximum(malformed).status).toBe("not_parsed");
  });

  test("requires the complete frequency and denominator of a daily mass statement", async () => {
    const [item] = await loadCabinet("warfarin");
    if (!item) throw new Error("fixture missing");
    const maximum = (statement: string) => labelledMaximum({ ...item, label: { dosage_and_administration: [statement] } }, ingredientOf(item, "warfarin"));
    expect(maximum("Maximum daily dosage is 2 mg.")).toMatchObject({ status: "parsed", mgPerDay: 2 });
    for (const text of ["450 mg twice daily", "4 mg/kg", "4 mg per kg", "4 mg for patients on dialysis"]) {
      expect(maximum(`Maximum daily dosage is ${text}.`).status).toBe("not_parsed");
    }
  });

  test("binds each combination-product mass limit to its named ingredient", async () => {
    const [item] = await loadCabinet("tylenolPm");
    if (!item) throw new Error("fixture missing");
    const maximum = (directions: string) => labelledMaximum({ ...item, label: { dosage_and_administration: [directions] } }, ingredientOf(item, "diphenhydramine"));
    expect(maximum("Maximum daily dose of acetaminophen is 2000 mg and diphenhydramine hydrochloride is 50 mg.")).toMatchObject({ status: "parsed", mgPerDay: 50 });
    expect(maximum("Maximum daily dose of acetaminophen with diphenhydramine is 2000 mg.").status).toBe("not_parsed");
  });

  test("preserves the salt strength basis and withholds a mixed-salt sum", async () => {
    const [benadryl, pm] = await loadCabinet("benadryl", "tylenolPm");
    if (!benadryl || !pm) throw new Error("fixtures missing");
    const hcl = ingredientOf(benadryl, "diphenhydramine");
    expect(hcl.strengthBasis).toBe("DIPHENHYDRAMINE HYDROCHLORIDE");
    const citrate = { ...benadryl, ingredients: [{ ...hcl, strengthBasis: "DIPHENHYDRAMINE CITRATE" }] };
    const flags = checkCabinet([citrate, pm], adultProfile);
    expect(flags.find((flag) => flag.type === "duplicate_ingredient")).toBeDefined();
    const total = flags.find((flag) => flag.type === "daily_total");
    expect(total?.numbers).toMatchObject({ totalMgPerDayAtEachMaximum: null, lowestMaxMgPerDay: null });
    expect(total?.detail.toLowerCase()).toContain("diphenhydramine citrate");
    const { strengthBasis: _basis, printedName: _name, ...legacy } = hcl;
    expect(dailyTotalFlags([{ ...benadryl, ingredients: [legacy] }, pm], adultProfile)[0]?.numbers?.["totalMgPerDayAtEachMaximum"]).toBeNull();
  });

  test("a missing maximum preserves an independently established ceiling warning", async () => {
    const [tylenol, nyquil] = await loadCabinet("tylenol", "nyquil");
    if (!tylenol || !nyquil) throw new Error("fixtures missing");
    const [flag] = dailyTotalFlags([tylenol, nyquil, { ...withoutLabel(tylenol), id: "unreadable" }], adultProfile);
    expect(flag).toMatchObject({ severity: "stop", numbers: { totalMgPerDayAtEachMaximum: null, knownSubtotalMgPerDay: 5600, labelWarningMgPerDay: 4000 } });
    expect(flag?.explain).toContain("5600");
    expect(flag?.explain).toContain("4000");
  });
});

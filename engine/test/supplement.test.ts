import { describe, expect, test } from "vitest";
import { resolveIdentity } from "../src/cabinet.ts";
import { dailyTotalFlags, labelledMaximum } from "../src/flags/dailyTotal.ts";
import { duplicateFlags } from "../src/flags/duplicates.ts";
import { interactionFlags } from "../src/flags/interactions.ts";
import type { DsldQuantity } from "../src/sources/dsld.ts";
import { buildSupplementItem, supplementItemFromLabel, SupplementNotFoundError } from "../src/supplement.ts";
import type { CabinetItem, Flag } from "../src/types.ts";
import { expectVerbatim, fixtureSources, loadMixedCabinet, loadSupplements, withoutLabel } from "./support/cabinet.ts";
import { MISSING_DSLD_ID } from "./support/products.ts";
import fishOilRecord from "../fixtures/judges/fish-oil-241612.json";
import { isNutritionFact } from "../src/supplementNames.ts";

function fromLabelOf(flags: readonly Flag[], labelOwnerId: string): readonly Flag[] {
  return flags.filter((flag) => flag.itemIds[0] === labelOwnerId);
}

function ingredientNames(item: CabinetItem | undefined): readonly string[] {
  return item?.ingredients.map((ingredient) => ingredient.name) ?? [];
}

describe("buildSupplementItem", () => {
  test("Nature’s Bounty fish oil with warfarin never matches the cholesterol warning", async () => {
    const rows = fishOilRecord.ingredients.map((row) => ({
      name: row.rawName,
      quantity: row.value === null ? [] : [{ quantity: row.value, unit: row.unit,
        servingSizeQuantity: row.per.value, servingSizeUnit: row.per.unit }],
      nestedRows: [], forms: [],
    }));
    const fishOil = await supplementItemFromLabel({ id: "fish", dsldId: fishOilRecord.dsldId }, {
      id: fishOilRecord.dsldId, fullName: fishOilRecord.displayName, brandName: fishOilRecord.maker,
      ingredientRows: rows, otherIngredients: [], servingSizes: [], statements: [],
    }, { rxNav: { ...fixtureSources().rxNav, findRxcui: async () => null } });
    expect(fishOil.label?.active_ingredient).toEqual([
      "Fish Oil", "Total Omega-3 Fatty Acids", "Eicosapentaenoic Acid", "Docosahexaenoic Acid", "Other Fatty Acids",
    ]);
    expect(ingredientNames(fishOil)).toEqual(fishOil.label?.active_ingredient?.map(name => name.toLowerCase()));
    const [warfarin] = await loadMixedCabinet(["warfarin"], []);
    if (!warfarin) throw new Error("missing warfarin fixture");
    expect(warfarin.label?.warnings_and_cautions?.join(" ")).toMatch(/cholesterol microemboli/i);
    // Only the label's general INR note about any botanical, never the cholesterol warning.
    const flags = interactionFlags([warfarin, fishOil]);
    expect(flags.every((flag) => /INR monitoring/i.test(flag.quote?.text ?? "") && flag.severity === "ask")).toBe(true);
    expect(flags.some((flag) => /cholesterol/i.test(flag.quote?.text ?? ""))).toBe(false);
    // The same rule also applies to previously saved cabinet items.
    const legacy = { ...fishOil, ingredients: [{ name: "cholesterol", value: 15, unit: "mg" }] };
    const warning = { ...warfarin, label: { drug_interactions: ["Avoid concomitant use with cholesterol."] } };
    expect(interactionFlags([warning, legacy])).toEqual([]);
  });

  test("excludes nutrition totals while retaining named substances", () => {
    for (const name of ["Calories", "Sodium", "Total Carbohydrates", "Added Sugars", "Dietary Fiber", "Trans Fat",
      "Saturated Fat", "Cholesterol", "Protein", "Sugar Alcohols"]) expect(isNutritionFact(name), name).toBe(true);
    for (const name of ["Sodium bicarbonate", "Fish oil", "Whey protein isolate", "Omega-3 fatty acids"]) {
      expect(isNutritionFact(name), name).toBe(false);
    }
  });
  test("turns a DSLD label into an unverified supplement item", async () => {
    const [melatonin] = await loadSupplements("melatonin");

    expect(melatonin).toMatchObject({
      id: "melatonin",
      displayName: "Solgar Melatonin 10 mg",
      dsldId: "13302",
      kind: "supplement",
      verified: false,
      dailyServings: { unitsPerServing: 1, servingsPerDay: 1, unit: "Tablet(s)" },
    });
    expect(melatonin?.ingredients).toMatchObject([
      { name: "melatonin", rxcui: "6711", value: 10, unit: "mg", per: { value: 1, unit: "Tablet(s)" } },
    ]);
  });

  test("vitamin D3 on a supplement and cholecalciferol on a drug record end up as one ingredient", async () => {
    const [vitaminD3] = await loadSupplements("vitaminD3");

    const fromDrugName = await resolveIdentity(["CHOLECALCIFEROL"], "cholecalciferol", fixtureSources());

    expect(vitaminD3?.ingredients[0]).toMatchObject({ name: "cholecalciferol", rxcui: "2418", value: 125, unit: "mcg" });
    expect(vitaminD3?.ingredients[0]?.commonNames).toEqual(["Vitamin D3", "Vitamin D"]);
    expect(fromDrugName).toMatchObject({ name: "cholecalciferol", rxcui: "2418" });
  });

  test("melatonin on a supplement and the openFDA substance name MELATONIN end up as one ingredient", async () => {
    const [melatonin] = await loadSupplements("melatonin");

    const fromDrugName = await resolveIdentity(["MELATONIN"], "melatonin", fixtureSources());

    expect(fromDrugName.name).toBe(melatonin?.ingredients[0]?.name);
    expect(fromDrugName.rxcui).toBe(melatonin?.ingredients[0]?.rxcui);
  });

  test("falls back to the DSLD ingredient group when RxNav does not know the printed name", async () => {
    const [stJohnsWort] = await loadSupplements("stJohnsWort");

    expect(ingredientNames(stJohnsWort)).toEqual(["st. john's wort extract", "hypericin"]);
    expect(stJohnsWort?.ingredients[0]).toMatchObject({ value: 1350, unit: "mg", per: { value: 3, unit: "Capsule(s)" } });
    expect(stJohnsWort?.ingredients[0]?.commonNames).toContain("St. John's Wort");
  });

  test("leaves out calorie and blend rows and does not count a part of an ingredient twice", async () => {
    const [fishOil] = await loadSupplements("fishOil");

    expect(ingredientNames(fishOil)).toEqual(["fish oils", "omega-3 acid ethyl esters (usp)"]);
    expect(fishOil?.ingredients.map((ingredient) => ingredient.value)).toEqual([475, 300]);
  });

  test("adds up two separate rows of the same ingredient", async () => {
    const [ginkgo] = await loadSupplements("ginkgo");

    expect(ginkgo?.ingredients).toMatchObject([{ name: "ginkgo biloba extract", value: 110, unit: "mg" }]);
  });

  test("keeps DSLD statements word for word as the label text", async () => {
    const [melatonin] = await loadSupplements("melatonin");

    expect(melatonin?.label?.warnings).toContain(
      "WARNING: Not intended for use by pregnant or nursing women. If you are taking any medications, consult your doctor before use.",
    );
    expect(melatonin?.label?.dosage_and_administration?.[0]).toContain("take one (1) tablet at bedtime");
    expect(melatonin?.label?.inactive_ingredient).toContain("Dicalcium Phosphate");
  });

  test("refuses to invent an item when DSLD has no such label", async () => {
    const request = { id: "missing", dsldId: MISSING_DSLD_ID };

    await expect(buildSupplementItem(request, fixtureSources())).rejects.toThrow(SupplementNotFoundError);
  });
});

describe("supplement daily amounts", () => {
  test("ginkgo includes every row across convertible mass units and serving sizes", async () => {
    const sources = fixtureSources();
    const label = await sources.dsld.getLabel("33452");
    if (!label) throw new Error("missing ginkgo fixture");
    const withSecondQuantity = async (quantity: readonly DsldQuantity[]) => {
      const ingredientRows = label.ingredientRows.map((row, index) => index === 1 ? { ...row, quantity } : row);
      const item = await supplementItemFromLabel({ id: "ginkgo", dsldId: label.id }, { ...label, ingredientRows }, sources);
      return labelledMaximum(item, item.ingredients[0]!);
    };

    const perTwo = { quantity: 60_000, unit: "mcg", servingSizeQuantity: 2, servingSizeUnit: "capsules" };
    expect(await withSecondQuantity([perTwo])).toMatchObject({ status: "parsed", mgPerDay: 330 });
    for (const quantity of [
      [], [{ ...perTwo, unit: "IU" }], [{ ...perTwo, unit: "NP" }], [{ ...perTwo, operator: "<" }],
      [{ ...perTwo, servingSizeUnit: "tablets" }], [{ ...perTwo, servingSizeQuantity: 0 }],
    ]) {
      expect(await withSecondQuantity(quantity)).toMatchObject({ status: "not_parsed" });
    }
  });

  test("uses the servings per day the label record gives", async () => {
    const [stJohnsWort, melatonin3mg] = await loadSupplements("stJohnsWort", "melatonin3mg");
    if (stJohnsWort?.ingredients[0] === undefined || melatonin3mg?.ingredients[0] === undefined) throw new Error("fixtures missing");

    const threeTimesDaily = labelledMaximum(stJohnsWort, stJohnsWort.ingredients[0]);
    const upToThreeCapsules = labelledMaximum(melatonin3mg, melatonin3mg.ingredients[0]);

    expect(threeTimesDaily).toMatchObject({ status: "parsed", mgPerDay: 1350, servings: { servingsPerDay: 3 } });
    expect(threeTimesDaily.status === "parsed" && threeTimesDaily.limit.quote.text).toContain("1 capsule 3 times daily");
    expect(upToThreeCapsules).toMatchObject({ status: "parsed", mgPerDay: 9 });
  });

  test("gives no amount per day when the label states no servings per day", async () => {
    const [melatonin] = await loadSupplements("melatonin");
    if (melatonin?.ingredients[0] === undefined) throw new Error("fixture missing");
    const { dailyServings: _dailyServings, ...withoutServings } = melatonin;

    const maximum = labelledMaximum(withoutServings, melatonin.ingredients[0]);

    expect(maximum).toEqual({ status: "not_parsed", reason: "the supplement label does not give servings per day" });
  });

  test("two melatonin supplements give a duplicate flag and a combined 19 mg a day", async () => {
    const items = await loadSupplements("melatonin", "melatonin3mg");

    const [duplicate] = duplicateFlags(items);
    const [total] = dailyTotalFlags(items);

    expect(duplicate).toMatchObject({ type: "duplicate_ingredient", itemIds: ["melatonin", "melatonin3mg"] });
    expect(total?.numbers).toEqual({
      "maxMgPerDay.melatonin": 10,
      "maxMgPerDay.melatonin3mg": 9,
      lowestMaxMgPerDay: 9,
      totalMgPerDayAtEachMaximum: 19,
      labelWarningMgPerDay: null,
    });
    expect(total?.severity).toBe("ask");
    for (const quote of [duplicate?.quote, total?.quote, ...(total?.supportingQuotes ?? [])]) expectVerbatim(quote, items);
  });

  test("no upper limit is invented: the label warning amount stays empty and nothing is marked stop", async () => {
    const items = await loadSupplements("melatonin", "melatonin3mg");

    const flags = [...duplicateFlags(items), ...dailyTotalFlags(items)];

    expect(flags.map((flag) => flag.severity)).toEqual(["ask", "ask"]);
    expect(flags[1]?.numbers?.["labelWarningMgPerDay"]).toBeNull();
  });

  test("without directions text to quote, no combined total is given", async () => {
    const [melatonin, melatonin3mg] = await loadSupplements("melatonin", "melatonin3mg");
    if (melatonin === undefined || melatonin3mg === undefined) throw new Error("fixtures missing");

    const [total] = dailyTotalFlags([melatonin, withoutLabel(melatonin3mg)]);

    expect(total?.numbers).toMatchObject({ "maxMgPerDay.melatonin3mg": null, totalMgPerDayAtEachMaximum: null });
  });
});

describe("drug labels that name supplements", () => {
  test("sertraline plus St. John's Wort: the sertraline label names it in its serotonin syndrome warning", async () => {
    const items = await loadMixedCabinet(["sertraline"], ["stJohnsWort"]);

    const flags = fromLabelOf(interactionFlags(items), "sertraline");

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "interaction", severity: "stop", itemIds: ["sertraline", "stJohnsWort"] });
    expect(flags[0]?.match).toMatchObject({ kind: "common_name", text: "St. John's Wort", ingredient: "st. john's wort extract" });
    expect(flags[0]?.quote?.section).toBe("warnings");
    expect(flags[0]?.quote?.text).toContain("concomitant use of other serotonergic drugs");
    expect(flags[0]?.quote?.excerpt).toContain("St. John's Wort");
    expectVerbatim(flags[0]?.quote, items);
  });

  test("warfarin: its label names St. John's wort, ginkgo and vitamin K, and each is flagged", async () => {
    const items = await loadMixedCabinet(["warfarin"], ["stJohnsWort", "ginkgo", "vitaminK"]);

    const flags = fromLabelOf(interactionFlags(items), "warfarin");

    expect(flags.map((flag) => [flag.itemIds[1], flag.quote?.section, flag.match?.kind, flag.match?.text])).toEqual([
      ["stJohnsWort", "drug_interactions", "common_name", "St. John’s wort"],
      ["ginkgo", "drug_interactions", "common_name", "ginkgo"],
      ["vitaminK", "drug_interactions", "common_name", "vitamin K"],
    ]);
    expect(flags[1]?.quote?.text).toContain("can interact with warfarin");
    expect(flags[0]?.quote?.text).toBe(
      "Conversely, some botanicals may decrease the effects of warfarin sodium (e.g., co-enzyme Q 10 , St. John’s wort, ginseng).",
    );
    for (const flag of flags) expectVerbatim(flag.quote, items);
  });

  test("warfarin: its label does not name fish oil, omega-3, vitamin D or melatonin, so those get no flag", async () => {
    const items = await loadMixedCabinet(["warfarin"], ["fishOil", "vitaminD3", "melatonin"]);
    const warfarinText = Object.values(items[0]?.label ?? {})
      .flat()
      .join(" ");

    expect(warfarinText).not.toMatch(/fish oil|omega-3|vitamin D|melatonin/i);
    // No named warning, only the label's general note to check INR when a botanical starts or stops.
    const flags = interactionFlags(items);
    expect(flags.every((flag) => flag.severity === "ask" && /INR monitoring[^.]*botanicals?/i.test(flag.quote?.text ?? ""))).toBe(true);
  });

  test("calcium in a supplement does not match the calcium uremic arteriolopathy warning on warfarin", async () => {
    const items = await loadMixedCabinet(["warfarin"], ["vitaminK"]);
    const warfarinText = (items[0]?.label?.warnings_and_cautions ?? []).join(" ");

    const flags = fromLabelOf(interactionFlags(items), "warfarin");

    expect(warfarinText).toContain("calcium uremic arteriolopathy");
    expect(flags.some((flag) => /calcium/i.test(flag.match?.text ?? ""))).toBe(false);
  });

  test("a supplement label that names a drug group is read the same way", async () => {
    const items = await loadMixedCabinet(["warfarin", "aspirin"], ["ginkgo"]);

    const flags = fromLabelOf(interactionFlags(items), "ginkgo");

    expect(flags.map((flag) => [flag.itemIds[1], flag.match?.text])).toEqual([
      ["warfarin", "anti-coagulant"],
      ["aspirin", "anti-platelet"],
    ]);
    expect(flags[0]?.quote?.text).toBe("Ginkgo may potentiate anti-coagulant/anti-platelet agents.");
    for (const flag of flags) expectVerbatim(flag.quote, items);
  });

  test("melatonin is in an ATC sedative group, so the NyQuil sedatives line covers it", async () => {
    const items = await loadMixedCabinet(["nyquil"], ["melatonin"]);

    const [flag] = fromLabelOf(interactionFlags(items), "nyquil");

    expect(items[1]?.ingredients[0]?.classes?.map((drugClass) => drugClass.id)).toContain("N05CH");
    expect(flag?.match).toMatchObject({ kind: "class_phrase", term: "sedative", ingredient: "melatonin" });
  });
});

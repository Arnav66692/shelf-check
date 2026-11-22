import { describe, expect, test } from "vitest";
import { compositionKey } from "../src/ranking.ts";
import type { NameSearchResult, ProductGroup } from "../src/types.ts";
import { offlineLookup } from "./offline.ts";

function names(result: NameSearchResult): readonly string[] {
  return result.groups.map((group) => group.product.displayName);
}

function first(result: NameSearchResult): ProductGroup {
  const [group] = result.groups;
  if (group === undefined) throw new Error("The search returned no groups.");
  return group;
}

describe("searchByName", () => {
  test("finds Tylenol Extra Strength and collapses the same tablet from many makers", async () => {
    const result = await offlineLookup().lookup.searchByName("tylenol extra strength");
    const top = first(result);

    expect(top.product).toMatchObject({
      source: "openfda",
      kind: "otc",
      displayName: "TYLENOL Extra Strength",
      maker: "Kenvue Brands LLC",
      form: "TABLET, FILM COATED",
      route: "ORAL",
      matchedBy: "name",
      ingredients: [{ rawName: "ACETAMINOPHEN", value: 500, unit: "mg", per: { value: 1, unit: "each" } }],
    });
    expect(top.product.recordUrl).toMatch(/^https:\/\/dailymed\.nlm\.nih\.gov\/dailymed\/drugInfo\.cfm\?setid=/);
    expect(top.makerCount).toBe(9);
    expect(top.members).toHaveLength(25);
    expect(result.drugMatchTotal).toBe(49);
    expect(result.sourceErrors).toEqual([]);
    expect(result.correctedQuery).toBeUndefined();
  });

  test("returns each composition and form once", async () => {
    const result = await offlineLookup().lookup.searchByName("tylenol extra strength");
    const keys = result.groups.map((group) => compositionKey(group.product));

    expect(new Set(keys).size).toBe(keys.length);
    expect(result.groups).toHaveLength(10);
    expect(result.groups.every((group) => group.members.every((member) => compositionKey(member) === compositionKey(group.product)))).toBe(true);
  });

  test("ranks plain Tylenol Extra Strength above the PM and cold variants", async () => {
    const result = await offlineLookup().lookup.searchByName("tylenol extra strength");
    const isPlain = names(result).map((name) => /^tylenol extra strength$/i.test(name));
    const firstVariant = names(result).findIndex((name) => /pm|cough|cold/i.test(name));
    const lastPlain = isPlain.lastIndexOf(true);

    expect(lastPlain).toBeGreaterThanOrEqual(0);
    expect(firstVariant).toBeGreaterThan(lastPlain);
  });

  test("respects the limit", async () => {
    const result = await offlineLookup().lookup.searchByName("tylenol extra strength", { limit: 3 });
    expect(result.groups).toHaveLength(3);
  });

  test("finds NyQuil products with every active ingredient and strength", async () => {
    const result = await offlineLookup().lookup.searchByName("nyquil");
    const coldAndFlu = result.groups.find((group) => group.product.displayName === "Vicks NyQuil Cold and Flu");

    expect(names(result).every((name) => /nyquil/i.test(name))).toBe(true);
    expect(coldAndFlu?.product.ingredients).toEqual([
      { rawName: "ACETAMINOPHEN", value: 650, unit: "mg", per: { value: 30, unit: "mL" }, strengthText: "650 mg/30mL" },
      { rawName: "DEXTROMETHORPHAN HYDROBROMIDE", value: 30, unit: "mg", per: { value: 30, unit: "mL" }, strengthText: "30 mg/30mL" },
      { rawName: "DOXYLAMINE SUCCINATE", value: 12.5, unit: "mg", per: { value: 30, unit: "mL" }, strengthText: "12.5 mg/30mL" },
    ]);
    expect(coldAndFlu?.members).toHaveLength(5);
  });

  test("puts the original maker ahead of repackagers as the representative", async () => {
    const result = await offlineLookup().lookup.searchByName("nyquil");
    const vapoCool = result.groups.find((group) => group.product.displayName === "Vicks NyQuil VapoCOOL COLD and FLU");

    expect(vapoCool?.makerCount).toBe(4);
    expect(vapoCool?.product.maker).toBe("The Procter & Gamble Manufacturing Company");
  });

  test("flags a kit that lists no active ingredients", async () => {
    const result = await offlineLookup().lookup.searchByName("nyquil");
    const kit = result.groups.find((group) => group.product.form === "KIT");

    expect(kit?.product.ingredients).toEqual([]);
    expect(kit?.product.confidenceNote).toContain("lists no active ingredients");
  });

  test("corrects a misspelled name through RxNav spelling suggestions", async () => {
    const { lookup, requested } = offlineLookup();
    const result = await lookup.searchByName("acetaminophn");
    const top = first(result);

    expect(result.correctedQuery).toBe("acetaminophen");
    expect(result.drugMatchTotal).toBe(3750);
    expect(top.product).toMatchObject({ displayName: "Acetaminophen", form: "TABLET", kind: "otc" });
    expect(top.product.ingredients).toMatchObject([{ rawName: "ACETAMINOPHEN", value: 500, unit: "mg" }]);
    expect(top.makerCount).toBe(8);
    expect(requested()).toContain("https://rxnav.nlm.nih.gov/REST/spellingsuggestions.json?name=acetaminophn");
  });

  test("falls back to RxNav approximate match and base ingredients when there is no spelling suggestion", async () => {
    const result = await offlineLookup().lookup.searchByName("ibuprofin pm");
    const top = first(result);

    expect(result.correctedQuery).toBe("diphenhydramine ibuprofen");
    expect(top.makerCount).toBe(34);
    expect(top.product.ingredients.map((ingredient) => ingredient.rawName)).toEqual(["IBUPROFEN", "DIPHENHYDRAMINE CITRATE"]);
  });

  test("returns an empty list, not an error, when nothing can be found", async () => {
    const result = await offlineLookup().lookup.searchByName("nyquill");
    expect(result).toEqual({ query: "nyquill", groups: [], drugMatchTotal: 0, sourceErrors: [] });
  });

  test("returns an empty list without any request for a query with no name", async () => {
    const { lookup, requested } = offlineLookup();
    expect((await lookup.searchByName("500 mg tablets")).groups).toEqual([]);
    expect((await lookup.searchByName("   ")).groups).toEqual([]);
    expect(requested()).toEqual([]);
  });

  test("merges supplements with drugs for melatonin and ranks on-market supplements first", async () => {
    const result = await offlineLookup().lookup.searchByName("melatonin");
    const top = first(result);

    expect(top.product).toMatchObject({
      source: "dsld",
      kind: "supplement",
      displayName: "Melatonin 3 mg",
      maker: "Solimo",
      form: "Tablet or Pill",
      dsldId: "239571",
      offMarket: false,
      recordUrl: "https://dsld.od.nih.gov/label/239571",
      labelImages: ["https://api.ods.od.nih.gov/dsld/s3/pdf/239571.pdf"],
      ingredients: [{ rawName: "Melatonin", value: 3, unit: "mg", per: { value: 1, unit: "Tablet(s)" } }],
    });
    expect(top.makerCount).toBe(4);
    expect(result.groups.map((group) => group.product.source)).toContain("openfda");
    expect(result.groups.every((group) => /melatonin/i.test(group.product.displayName))).toBe(true);
  });

  test("ranks the homeopathic melatonin drug listings below the supplements", async () => {
    const result = await offlineLookup().lookup.searchByName("melatonin");
    const sources = result.groups.map((group) => group.product.source);

    expect(sources.lastIndexOf("dsld")).toBeLessThan(sources.indexOf("openfda"));
  });

  test("uses a typed strength and form to pick the right supplement", async () => {
    const result = await offlineLookup().lookup.searchByName("melatonin 10 mg tablet");
    const top = first(result);

    expect(top.product).toMatchObject({ displayName: "Melatonin 10 mg", maker: "Solgar", dsldId: "65690" });
    expect(top.product.ingredients).toEqual([{ rawName: "Melatonin", value: 10, unit: "mg", per: { value: 1, unit: "Tablet(s)" } }]);
    expect(top.makerCount).toBe(4);
  });

  test("serves a repeated search from the in-memory cache", async () => {
    const { lookup, requested } = offlineLookup();
    await lookup.searchByName("nyquil");
    const afterFirst = requested().length;
    await lookup.searchByName("nyquil");

    expect(afterFirst).toBeGreaterThan(0);
    expect(requested()).toHaveLength(afterFirst);
  });
});

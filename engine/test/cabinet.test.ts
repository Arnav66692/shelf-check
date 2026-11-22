import { describe, expect, test } from "vitest";
import { buildCabinetItem, ProductNotFoundError } from "../src/cabinet.ts";
import { createOpenFdaClient, parseStrength } from "../src/sources/openfda.ts";
import { interactionFlags } from "../src/flags/interactions.ts";
import type { CabinetItem, LabelSections } from "../src/types.ts";
import ozempicRecords from "../fixtures/official/openfda-ndc-ozempic.json";
import insulinRecords from "../fixtures/judges/insulin-products.json";
import { readOfficialFile } from "./support/officialPages.ts";
import { fixtureSources, loadCabinet } from "./support/cabinet.ts";
import { MISSING_PRODUCT_NDC } from "./support/products.ts";

describe("buildCabinetItem", () => {
  test("builds NyQuil with base ingredient names and liquid strengths", async () => {
    const [nyquil] = await loadCabinet("nyquil");

    expect(nyquil?.kind).toBe("otc");
    expect(nyquil?.verified).toBe(true);
    expect(nyquil?.ingredients.map(({ name, value, unit, per }) => ({ name, value, unit, per }))).toEqual([
      { name: "acetaminophen", value: 650, unit: "mg", per: { value: 30, unit: "mL" } },
      { name: "dextromethorphan", value: 30, unit: "mg", per: { value: 30, unit: "mL" } },
      { name: "doxylamine", value: 12.5, unit: "mg", per: { value: 30, unit: "mL" } },
    ]);
  });

  test("marks warfarin as a prescription product in the vitamin K antagonist class", async () => {
    const [warfarin] = await loadCabinet("warfarin");

    expect(warfarin?.kind).toBe("rx");
    expect(warfarin?.ingredients[0]?.name).toBe("warfarin");
    expect(warfarin?.ingredients[0]?.classes?.map((drugClass) => drugClass.id)).toContain("B01AA");
  });

  test("refuses to invent an item when openFDA has no record", async () => {
    const request = { id: "missing", productNdc: MISSING_PRODUCT_NDC };

    await expect(buildCabinetItem(request, fixtureSources())).rejects.toThrow(ProductNotFoundError);
  });
});

const INJECTION_SET_ID = "adec4fd2-6858-4c99-91d4-531f5f2a2d79";
const injectionXml = readOfficialFile(`peptide-labels/dailymed-spl-${INJECTION_SET_ID}.xml`);

async function ozempicItem(raw: Record<string, unknown> & { product_ndc: string }, primary?: LabelSections, requestedNdc = raw.product_ndc) {
  const sources = fixtureSources();
  const openFda = createOpenFdaClient({
    fetch: async (url) => {
      if (url.includes("/ndc.json?")) return { status: 200, text: async () => JSON.stringify({ results: [raw] }) };
      if (url.includes("/label.json?")) return primary
        ? { status: 200, text: async () => JSON.stringify({ results: [primary] }) }
        : { status: 404, text: async () => "{}" };
      throw new Error(`Unrecorded URL: ${url}`);
    },
  });
  return buildCabinetItem({ id: "ozempic", productNdc: requestedNdc }, {
    openFda, rxNav: { ...sources.rxNav, findRxcui: async () => null },
  });
}

describe("DailyMed cabinet label fallback", () => {
  test.each(ozempicRecords.results)("recovers warnings and insulin co-use from the saved Ozempic injection SPL for $product_ndc", async (raw) => {
    const item = await ozempicItem(raw);
    expect(item.labelSource).toMatchObject({ name: "DailyMed", setId: INJECTION_SET_ID, version: 20, labelDate: "2026-06-01" });
    expect(injectionXml).toContain(`<code code="${raw.product_ndc}"`);
    expect(item.label?.boxed_warning?.join(" ")).toContain("Multiple Endocrine Neoplasia syndrome type 2");
    expect(item.label?.drug_interactions?.join(" ")).toContain("increased risk of hypoglycemia, including severe hypoglycemia");
    for (const record of insulinRecords) {
      const classes = record.pharm_class.filter((name) => name.endsWith(" [EPC]")).map((entry) => ({
        name: entry.replace(/ \[EPC\]$/, ""), id: entry, type: "EPC", source: "FDASPL",
      }));
      const insulin: CabinetItem = {
        id: record.product_ndc, productNdc: record.product_ndc, displayName: record.brand_name, kind: "rx", verified: true,
        ingredients: record.active_ingredients.map((ing) => ({ name: ing.name.toLowerCase(), classes, ...parseStrength(ing.strength) })),
      };
      const interaction = interactionFlags([item, insulin]).find((flag) => flag.quote?.section === "drug_interactions");
      expect(interaction?.quote?.text, insulin.displayName).toContain("hypoglycemia");
      expect(interaction?.itemIds).toEqual([item.id, insulin.id]);
    }
  });

  test("each bundled Ozempic paragraph is traceable to the saved SPL", async () => {
    const item = await ozempicItem(ozempicRecords.results[0]!);
    const prose = injectionXml
      .replace(/<\/?(?:content|linkHtml|sub|sup)\b[^>]*>/g, "")
      .replace(/<[^>]+>/g, " ").replace(/&gt;/g, ">").replace(/&lt;/g, "<")
      .replace(/&amp;/g, "&").replace(/\s+/g, " ");
    const sections = item.label ?? {};
    expect(Object.keys(sections)).toHaveLength(10);
    for (const paragraph of Object.values(sections).flat()) expect(prose.includes(paragraph), paragraph).toBe(true);
  });

  test("prefers readable openFDA text and requires a verified presentation and identifier for fallback", async () => {
    const raw = ozempicRecords.results[0]!;
    const primary = { indications_and_usage: ["Primary label text."] };
    expect((await ozempicItem(raw, primary)).label).toEqual(primary);
    expect((await ozempicItem(raw, { warnings: [" "] })).labelSource?.setId).toBe(INJECTION_SET_ID);
    expect((await ozempicItem({ ...raw, product_ndc: "99999-0000" })).label).toBeUndefined();
    await expect(ozempicItem(raw, undefined, "99999-0000")).rejects.toThrow(ProductNotFoundError);
    expect((await ozempicItem({ ...raw, dosage_form: "TABLET" })).label).toBeUndefined();
    expect((await ozempicItem({ ...raw, openfda: { spl_set_id: ["different-set-id"] } })).label).toBeUndefined();
    const linked = { ...raw, product_ndc: "99999-0000", openfda: { spl_set_id: [INJECTION_SET_ID] } };
    expect((await ozempicItem(linked)).labelSource?.setId).toBe(INJECTION_SET_ID);
  });
});

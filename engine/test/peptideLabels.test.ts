import { readdirSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  DAILYMED_LABEL_URL,
  NO_APPROVED_USE_NOTICE,
  PEPTIDE_LABELS,
  peptideUses,
  PRESCRIBER_NOTICE,
  SERMORELIN_NOTICE,
} from "../src/peptideLabels.ts";
import type { ProductLabel } from "../src/peptideLabels.ts";
import { PEPTIDE_IDS, PEPTIDES } from "../src/peptides.ts";
import { isRecord, recordArrayField, stringField } from "../src/sources/http.ts";
import { FIXTURE_DIR } from "./support/fixtures.ts";
import { readOfficialFile } from "./support/officialPages.ts";

const LABEL_DIR = "peptide-labels/";
const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&lt;": "<", "&gt;": ">", "&apos;": "'" };
// SPL marks inline runs with <content> and cross-references with <linkHtml>, so they join text like <span> and <a> do.
const INLINE_TAG = /<\/?(?:a|em|strong|b|i|u|sup|sub|span|abbr|content|linkHtml)(?:\s[^>]*)?>/gi;
const SECTION_CODES = {
  boxedWarning: "34066-1",
  indications: "34067-9",
  dosing: "34068-7",
  contraindications: "34070-3",
} as const;
const DOSE_AMOUNT = /\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|mL|IU|units?)\b/i;

type QuotedField = keyof typeof SECTION_CODES;

interface SearchHit {
  readonly setId: string;
  readonly title: string;
  readonly version: string;
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splToText(xml: string): string {
  const visible = xml
    .replace(INLINE_TAG, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|nbsp|quot|lt|gt|apos);/g, (entity) => ENTITIES[entity] ?? entity);
  return collapseWhitespace(visible);
}

function labelXml(product: ProductLabel): string {
  return readOfficialFile(`${LABEL_DIR}dailymed-spl-${product.setId}.xml`);
}

function sectionXml(xml: string, code: string): string {
  const codeAt = xml.indexOf(`<code code="${code}"`);
  if (codeAt < 0) throw new Error(`No section with LOINC code ${code}`);
  const start = xml.lastIndexOf("<section", codeAt);
  let depth = 0;
  for (const tag of xml.slice(start).matchAll(/<(\/?)section\b/g)) {
    depth += tag[1] === "/" ? -1 : 1;
    if (depth === 0) return xml.slice(start, start + tag.index);
  }
  throw new Error(`Section ${code} is never closed`);
}

function searchHits(): readonly SearchHit[] {
  const dir = `${FIXTURE_DIR}official/${LABEL_DIR}`;
  return readdirSync(dir)
    .filter((name) => name.startsWith("dailymed-search-"))
    .flatMap((name) => {
      const body: unknown = JSON.parse(readOfficialFile(`${LABEL_DIR}${name}`));
      if (!isRecord(body)) throw new Error(`${name} is not a JSON object`);
      return recordArrayField(body, "data").map((hit) => ({
        setId: stringField(hit, "setid") ?? "",
        title: stringField(hit, "title") ?? "",
        version: String(hit["spl_version"]),
      }));
    });
}

function searchTotal(drugName: string): unknown {
  const body: unknown = JSON.parse(readOfficialFile(`${LABEL_DIR}dailymed-search-${drugName}.json`));
  return isRecord(body) && isRecord(body["metadata"]) ? body["metadata"]["total_elements"] : undefined;
}

const PRODUCTS: readonly { readonly id: string; readonly product: ProductLabel }[] = PEPTIDE_IDS.flatMap((id) => {
  const entry = PEPTIDE_LABELS[id];
  return entry.approved ? entry.products.map((product) => ({ id, product })) : [];
});

const QUOTES = PRODUCTS.flatMap(({ product }) =>
  (Object.keys(SECTION_CODES) as QuotedField[]).flatMap((field) =>
    (product[field] ?? []).map((text) => ({ brand: product.brand, field, text, product })),
  ),
);

describe("DailyMed labels for peptides with an FDA-approved product", () => {
  test("eight stored SPLs cover every current brand", () => {
    expect(new Set(PRODUCTS.map(({ product }) => product.setId)).size).toBe(8);
    expect([...new Set(PRODUCTS.map(({ product }) => product.brand))]).toEqual([
      "Ozempic",
      "Wegovy",
      "Rybelsus",
      "Mounjaro",
      "Zepbound",
      "Egrifta SV",
      "Egrifta WR",
      "Vyleesi",
    ]);
  });

  test.each(PRODUCTS)("$product.brand: set id, version and date match the saved SPL header", ({ product }) => {
    const header = new RegExp(
      `<effectiveTime value="${product.labelDate.replaceAll("-", "")}"/>\\s*<setId root="${product.setId}"/>\\s*<versionNumber value="${product.version}"/>`,
    );

    expect(labelXml(product)).toMatch(header);
    expect(product.url).toBe(`${DAILYMED_LABEL_URL}${product.setId}`);
  });

  test.each(PRODUCTS)("$product.brand: the title and version match the saved DailyMed search result", ({ product }) => {
    const hit = searchHits().find((candidate) => candidate.setId === product.setId);

    expect(hit?.title).toBe(product.title);
    expect(hit?.version).toBe(String(product.version));
    expect(product.title.toUpperCase()).toContain(product.brand.toUpperCase());
  });

  test.each(PRODUCTS)("$product.brand: indications, dosing and contraindications are all present", ({ product }) => {
    expect(product.indications.length).toBeGreaterThan(0);
    expect(product.dosing.length).toBeGreaterThan(0);
    expect(product.contraindications?.length ?? 0).toBeGreaterThan(0);
  });

  test.each(QUOTES)("$brand $field quote is copied character for character from its label section: $text", ({ product, field, text }) => {
    const xml = labelXml(product);

    expect(text).toBe(collapseWhitespace(text));
    expect(splToText(xml)).toContain(text);
    expect(splToText(sectionXml(xml, SECTION_CODES[field]))).toContain(text);
  });

  test("a label with a boxed warning section has it stored, and one without has none", () => {
    for (const { product } of PRODUCTS) {
      const hasBoxed = labelXml(product).includes(`<code code="${SECTION_CODES.boxedWarning}"`);
      expect(product.boxedWarning !== undefined, product.brand).toBe(hasBoxed);
    }
  });
});

describe("PEPTIDE_LABELS agrees with the peptide table", () => {
  test.each([...PEPTIDE_IDS])("%s is approved here only when the table lists an approved product", (id) => {
    expect(PEPTIDE_LABELS[id].approved).toBe(PEPTIDES[id].approvedProducts.length > 0);
  });

  test.each(PEPTIDE_IDS.flatMap((id) => PEPTIDES[id].approvedProducts.map((product) => ({ id, ...product }))))(
    "$brand ($status) has a stored label exactly when it is still sold",
    ({ id, brand, status }) => {
      const entry = PEPTIDE_LABELS[id];
      const brands = entry.approved ? entry.products.map((product) => product.brand) : [];

      expect(brands.includes(brand)).toBe(status === "prescription");
    },
  );

  test("sermorelin is marked historical because DailyMed returned no label for Geref or sermorelin", () => {
    expect(searchTotal("geref")).toBe(0);
    expect(searchTotal("sermorelin")).toBe(0);
    expect(PEPTIDE_LABELS.sermorelin).toEqual({ approved: true, products: [], notice: SERMORELIN_NOTICE });
    expect(peptideUses("sermorelin")).toEqual([SERMORELIN_NOTICE, PRESCRIBER_NOTICE]);
  });
});

describe("peptideUses", () => {
  test.each(PEPTIDE_IDS.filter((id) => !PEPTIDE_LABELS[id].approved))(
    "%s says there is no approved use or dose, and gives no dose amount",
    (id) => {
      const lines = peptideUses(id);

      expect(lines).toEqual([NO_APPROVED_USE_NOTICE, PRESCRIBER_NOTICE]);
      expect(lines.some((line) => DOSE_AMOUNT.test(line))).toBe(false);
    },
  );

  test.each(PRODUCTS)("$product.brand lines carry every stored quote, the source, and end with the prescriber line", ({ id, product }) => {
    const text = peptideUses(id as keyof typeof PEPTIDE_LABELS).join("\n");
    const quotes = [...product.indications, ...product.dosing, ...(product.boxedWarning ?? []), ...(product.contraindications ?? [])];

    for (const quote of quotes) expect(text).toContain(`"${quote}"`);
    expect(text).toContain(product.url);
    expect(text).toContain(`label version ${product.version}, dated ${product.labelDate}`);
    expect(peptideUses(id as keyof typeof PEPTIDE_LABELS).at(-1)).toBe(PRESCRIBER_NOTICE);
  });
});

describe("formulation-specific schedule excerpts", () => {
  test("separates semaglutide schedules by brand, form and route and preserves the substitution warning", () => {
    const entry = PEPTIDE_LABELS.semaglutide;
    if (!entry.approved) throw new Error("semaglutide products missing");
    const schedules = Object.fromEntries(entry.products.map((p) => [p.presentation, p.dosing.join(" ")]));
    expect(Object.keys(schedules).sort()).toEqual([
      "Ozempic oral tablet", "Ozempic subcutaneous injection", "Rybelsus oral tablet",
      "Wegovy oral tablet", "Wegovy subcutaneous injection",
    ]);
    expect(schedules["Ozempic oral tablet"]).toContain("1.5 mg orally once daily");
    expect(schedules["Rybelsus oral tablet"]).toContain("3 mg orally once daily");
    for (const [name, dosing] of Object.entries(schedules)) {
      if (name.endsWith("injection")) {
        expect(dosing).toContain("once weekly");
        expect(dosing).not.toContain("once daily");
      } else {
        expect(dosing).toContain("once daily");
        expect(dosing).not.toContain("once weekly");
        if (!name.startsWith("Wegovy")) expect(dosing).toContain("not substitutable on a mg-to-mg basis");
      }
    }
  });

  test("keeps tirzepatide escalation with its audience, interval and dose ceiling", () => {
    const entry = PEPTIDE_LABELS.tirzepatide;
    if (!entry.approved) throw new Error("tirzepatide products missing");
    const [mounjaro, zepbound] = entry.products.map((p) => p.dosing.join(" "));
    expect(mounjaro).toContain("at least 4 weeks");
    expect(mounjaro).toContain("Adults: 15 mg");
    expect(mounjaro).toContain("Pediatric patients 10 years of age and older: 10 mg");
    expect(zepbound).toContain("at least 4 weeks");
    expect(zepbound).toContain("Maximum Recommended Dosage: 15 mg");
    expect(zepbound).toContain("Obstructive Sleep Apnea: 10 mg or 15 mg");
  });
});

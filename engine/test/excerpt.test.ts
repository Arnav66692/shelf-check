import { describe, expect, test } from "vitest";
import { checkCabinet } from "../src/index.ts";
import type { HealthProfile } from "../src/flags/profile.ts";
import { excerptAround, MAX_EXCERPT_LENGTH, splitSentences } from "../src/text.ts";
import type { CabinetItem, Flag, Quote } from "../src/types.ts";
import { expectVerbatim, loadMixedCabinet } from "./support/cabinet.ts";
import { PRODUCT_NDCS, SUPPLEMENT_DSLD_IDS } from "./support/products.ts";
import type { ProductId, SupplementId } from "./support/cabinet.ts";

const ELLIPSIS = "…";
const LONG_TEXT = `${"alpha beta gamma delta ".repeat(20)}WARFARIN ${"epsilon zeta eta theta ".repeat(20)}`.trim();

const EVERYTHING: HealthProfile = {
  ageYears: 8,
  pregnant: true,
  breastfeeding: true,
  drinksThreeOrMoreDaily: true,
  conditions: ["liver_disease", "kidney_disease", "glaucoma", "breathing_problem", "stomach_ulcers_or_bleeding", "diabetes"],
  allergies: ["aspirin", "fish", "lactose"],
};

function withoutEllipses(excerpt: string): string {
  return excerpt.replace(new RegExp(`^${ELLIPSIS}|${ELLIPSIS}$`, "g"), "");
}

function quotesOf(flag: Flag): readonly Quote[] {
  return [...(flag.quote === undefined ? [] : [flag.quote]), ...(flag.supportingQuotes ?? [])];
}

function everyItem(): Promise<readonly CabinetItem[]> {
  return loadMixedCabinet(Object.keys(PRODUCT_NDCS) as ProductId[], Object.keys(SUPPLEMENT_DSLD_IDS) as SupplementId[]);
}

async function everyFlag(): Promise<readonly Flag[]> {
  return checkCabinet(await everyItem(), EVERYTHING);
}

describe("excerptAround", () => {
  test("returns short text unchanged", () => {
    expect(excerptAround("Do not use with warfarin.", { start: 16, end: 24 })).toBe("Do not use with warfarin.");
  });

  test("centres on the focus, cuts at word boundaries and marks both cuts", () => {
    const start = LONG_TEXT.indexOf("WARFARIN");

    const excerpt = excerptAround(LONG_TEXT, { start, end: start + "WARFARIN".length });
    const body = withoutEllipses(excerpt);
    const before = body.indexOf("WARFARIN");
    const after = body.length - before - "WARFARIN".length;

    expect(excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
    expect(excerpt.startsWith(ELLIPSIS)).toBe(true);
    expect(excerpt.endsWith(ELLIPSIS)).toBe(true);
    expect(LONG_TEXT).toContain(body);
    expect(Math.abs(before - after)).toBeLessThan(20);
    expect(LONG_TEXT.charAt(LONG_TEXT.indexOf(body) - 1)).toBe(" ");
    expect(LONG_TEXT.charAt(LONG_TEXT.indexOf(body) + body.length)).toBe(" ");
  });

  test("keeps a focus at the very start or the very end", () => {
    const fromStart = excerptAround(LONG_TEXT, { start: 0, end: 5 });
    const fromEnd = excerptAround(LONG_TEXT, { start: LONG_TEXT.length - 5, end: LONG_TEXT.length });

    expect(fromStart.startsWith("alpha")).toBe(true);
    expect(fromStart.endsWith(ELLIPSIS)).toBe(true);
    expect(fromEnd.startsWith(ELLIPSIS)).toBe(true);
    expect(fromEnd.endsWith("theta")).toBe(true);
  });

  test("never cuts into a focus that is longer than the limit", () => {
    const excerpt = excerptAround(LONG_TEXT, { start: 10, end: 400 });

    expect(withoutEllipses(excerpt)).toContain(LONG_TEXT.slice(10, 400).trim());
  });
});

describe("quote.excerpt on real flags", () => {
  test("every excerpt is at most 240 characters and is a piece of the full quote", async () => {
    const quotes = (await everyFlag()).flatMap(quotesOf);

    expect(quotes.length).toBeGreaterThan(50);
    expect(quotes.some((quote) => quote.text.length > MAX_EXCERPT_LENGTH)).toBe(true);
    for (const quote of quotes) {
      expect(quote.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
      expect(quote.text).toContain(withoutEllipses(quote.excerpt));
      if (quote.text.length <= MAX_EXCERPT_LENGTH) expect(quote.excerpt).toBe(quote.text);
    }
  });

  test("every quote, drug or supplement, is found word for word in the label it names", async () => {
    const items = await everyItem();

    for (const quote of checkCabinet(items, EVERYTHING).flatMap(quotesOf)) expectVerbatim(quote, items);
  });

  test("the excerpt always contains the matched term", async () => {
    const matched = (await everyFlag()).filter((flag) => flag.match !== undefined);

    expect(matched.filter((flag) => flag.type === "interaction").length).toBeGreaterThan(10);
    expect(matched.filter((flag) => flag.type === "profile").length).toBeGreaterThan(10);
    for (const flag of matched) expect(flag.quote?.excerpt).toContain(flag.match?.text);
  });

  test("the full label sentence stays available next to a shortened excerpt", async () => {
    const shortened = (await everyFlag()).find((flag) => (flag.quote?.text.length ?? 0) > 800);

    expect(shortened?.quote?.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_LENGTH);
    expect(shortened?.quote?.text.length).toBeGreaterThan(800);
  });

  test("every flag carries one plain sentence in explain", async () => {
    const flags = await everyFlag();

    for (const flag of flags) {
      expect(flag.explain.length).toBeGreaterThan(20);
      expect(flag.explain.endsWith(".")).toBe(true);
      expect(splitSentences(flag.explain), flag.explain).toHaveLength(1);
    }
  });
});

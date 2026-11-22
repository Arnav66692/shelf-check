import { findByCode, PER_EACH_UNIT, searchByName } from "@lookup/index.ts";
import type { CodeLookupResult, IdentifiedProduct } from "@lookup/types.ts";
import { isNutritionFact } from "@engine/supplementNames.ts";
import type { Product, Strength } from "@/lib/model";

const RESULT_LIMIT = 12;

function productId(record: IdentifiedProduct): string {
  if (record.productNdc) return `ndc:${record.productNdc}`;
  if (record.dsldId) return `dsld:${record.dsldId}`;
  return `name:${record.maker}:${record.displayName}`.toLowerCase();
}

function toStrengths(record: IdentifiedProduct): readonly Strength[] {
  return record.ingredients.flatMap((ingredient) => {
    if (ingredient.value === null || isNutritionFact(ingredient.rawName)) return [];
    const per = ingredient.per && ingredient.per.unit !== PER_EACH_UNIT ? ingredient.per : undefined;
    return [{ name: ingredient.rawName.toLowerCase(), value: ingredient.value, unit: ingredient.unit, per }];
  });
}

export function toProduct(record: IdentifiedProduct, sameAsCount?: number): Product {
  return {
    id: productId(record),
    kind: record.kind,
    displayName: record.displayName,
    maker: record.maker,
    form: record.form,
    productNdc: record.productNdc,
    dsldId: record.dsldId,
    ingredients: toStrengths(record),
    labelImages: record.labelImages,
    recordUrl: record.recordUrl,
    matchedBy: record.matchedBy,
    sameAsCount,
    note: record.confidenceNote,
    record,
  };
}

const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const RXNAV_TIMEOUT_MS = 8000;
const BARCODE_NOT_FOUND =
  "No product with that barcode is in the FDA or NIH data. Type the name printed on the box, like warfarin or Tylenol.";

async function rxnavJson(path: string): Promise<unknown> {
  const response = await fetch(`${RXNAV}${path}`, { signal: AbortSignal.timeout(RXNAV_TIMEOUT_MS) });
  if (!response.ok) return null;
  return response.json();
}

async function genericForBrand(name: string): Promise<string | null> {
  try {
    const ids = (await rxnavJson(`/rxcui.json?name=${encodeURIComponent(name)}&search=2`)) as {
      idGroup?: { rxnormId?: string[] };
    } | null;
    const rxcui = ids?.idGroup?.rxnormId?.[0];
    if (!rxcui) return null;
    const related = (await rxnavJson(`/rxcui/${rxcui}/related.json?tty=IN`)) as {
      relatedGroup?: { conceptGroup?: { conceptProperties?: { name: string }[] }[] };
    } | null;
    const names = (related?.relatedGroup?.conceptGroup ?? []).flatMap((group) => group.conceptProperties ?? []);
    return names.length === 1 ? names[0].name : null;
  } catch (error) {
    console.error("brand to generic lookup failed", error);
    return null;
  }
}

export type FindResult = { readonly products: readonly Product[]; readonly note?: string };

async function spellingSuggestion(name: string): Promise<string | null> {
  try {
    const found = (await rxnavJson(`/spellingsuggestions.json?name=${encodeURIComponent(name)}`)) as {
      suggestionGroup?: { suggestionList?: { suggestion?: string[] } };
    } | null;
    return found?.suggestionGroup?.suggestionList?.suggestion?.[0] ?? null;
  } catch (error) {
    console.error("spelling suggestion failed", error);
    return null;
  }
}

async function retries(query: string): Promise<string[]> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const collapsed = words.map((word) => word.replace(/(.)\1+/g, "$1")).join(" ");
  const suggested = await spellingSuggestion(query);
  const shorter = words.length > 1 ? words.slice(0, -1).join(" ") : null;
  const tries = [collapsed, suggested, shorter].filter((value): value is string => !!value && value !== query.toLowerCase());
  return [...new Set(tries)];
}

async function closeSpelling(query: string): Promise<FindResult | null> {
  for (const attempt of await retries(query)) {
    const found = await searchByName(attempt, { limit: RESULT_LIMIT });
    if (found.groups.length > 0) {
      return {
        products: found.groups.map((group) => toProduct(group.product, group.makerCount)),
        note: `Nothing matched "${query}". Showing results for "${attempt}". Pick the one that matches your label.`,
      };
    }
  }
  return null;
}

function fromCode(result: CodeLookupResult): FindResult {
  if (result.status === "not_found") return { products: [], note: result.message };
  return { products: result.products.slice(0, RESULT_LIMIT).map((record) => toProduct(record)) };
}

export async function findProducts(rawQuery: string): Promise<FindResult> {
  const query = rawQuery.trim();
  const code = await findByCode(query);
  if (code !== null) {
    const result = fromCode(code);
    const digits = query.replace(/\D/g, "");
    return result.products.length === 0 && digits.length >= 12 && code.status === "not_found" && code.reason === "no_match"
      ? { products: [], note: BARCODE_NOT_FOUND }
      : result;
  }
  const found = await searchByName(query, { limit: RESULT_LIMIT });
  if (found.groups.length === 0) {
    const generic = await genericForBrand(query);
    if (generic && generic.toLowerCase() !== query.toLowerCase()) {
      const byGeneric = await searchByName(generic, { limit: RESULT_LIMIT });
      if (byGeneric.groups.length > 0) {
        return {
          products: byGeneric.groups.map((group) => toProduct(group.product, group.makerCount)),
          note: `${query} is a brand name for ${generic}. These are ${generic} products, so pick the one that matches your label.`,
        };
      }
    }
    const close = await closeSpelling(query);
    if (close) return close;
  }
  const products = found.groups.map((group) => toProduct(group.product, group.makerCount));
  const corrected = found.correctedQuery ? `Showing results for "${found.correctedQuery}".` : undefined;
  const partial =
    found.sourceErrors.length > 0 ? "One of the official sources did not answer, so this list may be incomplete." : undefined;
  return { products, note: [corrected, partial].filter(Boolean).join(" ") || undefined };
}

import { findByBarcode, findByNdc, PER_EACH_UNIT, searchByName } from "@lookup/index.ts";
import type { CodeLookupResult, IdentifiedProduct } from "@lookup/types.ts";
import type { Product, Strength } from "@/lib/model";

const RESULT_LIMIT = 12;
const DIGITS_ONLY = /^\d+$/;
const NDC_SHAPE = /^\d{4,5}-\d{3,4}(-\d{1,2})?$/;
const BARCODE_LENGTHS = [12, 13];

function productId(record: IdentifiedProduct): string {
  if (record.productNdc) return `ndc:${record.productNdc}`;
  if (record.dsldId) return `dsld:${record.dsldId}`;
  return `name:${record.maker}:${record.displayName}`.toLowerCase();
}

function toStrengths(record: IdentifiedProduct): readonly Strength[] {
  return record.ingredients.flatMap((ingredient) => {
    if (ingredient.value === null) return [];
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

function fromCode(result: CodeLookupResult): FindResult {
  if (result.status === "not_found") return { products: [], note: result.message };
  return { products: result.products.slice(0, RESULT_LIMIT).map((record) => toProduct(record)) };
}

export async function findProducts(rawQuery: string): Promise<FindResult> {
  const query = rawQuery.trim();
  const compact = query.replace(/\s+/g, "");
  if (NDC_SHAPE.test(compact)) return fromCode(await findByNdc(compact));
  if (DIGITS_ONLY.test(compact) && compact.length >= 8) {
    if (BARCODE_LENGTHS.includes(compact.length)) {
      const byBarcode = fromCode(await findByBarcode(compact));
      return byBarcode.products.length > 0 ? byBarcode : { products: [], note: BARCODE_NOT_FOUND };
    }
    return fromCode(await findByNdc(compact));
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
  }
  const products = found.groups.map((group) => toProduct(group.product, group.makerCount));
  const corrected = found.correctedQuery ? `Showing results for "${found.correctedQuery}".` : undefined;
  const partial =
    found.sourceErrors.length > 0 ? "One of the official sources did not answer, so this list may be incomplete." : undefined;
  return { products, note: [corrected, partial].filter(Boolean).join(" ") || undefined };
}

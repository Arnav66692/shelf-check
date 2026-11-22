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
      if (byBarcode.products.length > 0) return byBarcode;
    }
    return fromCode(await findByNdc(compact));
  }
  const found = await searchByName(query, { limit: RESULT_LIMIT });
  const products = found.groups.map((group) => toProduct(group.product, group.makerCount));
  const corrected = found.correctedQuery ? `Showing results for "${found.correctedQuery}".` : undefined;
  const partial =
    found.sourceErrors.length > 0 ? "One of the official sources did not answer, so this list may be incomplete." : undefined;
  return { products, note: [corrected, partial].filter(Boolean).join(" ") || undefined };
}

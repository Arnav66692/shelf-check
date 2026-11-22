import { createLookup } from "./lookup.ts";
import type { CodeLookupResult, IdentifiedProduct, LabelSections, NameSearchOptions, NameSearchResult } from "./types.ts";

export * from "./types.ts";
export * from "./errors.ts";
export { createLookup, openFdaApiKeyFromEnv } from "./lookup.ts";
export type { Environment, Lookup, LookupOptions } from "./lookup.ts";
export type { FetchFn, FetchResponse } from "./http.ts";
export { correctedQuery, parseQuery } from "./query.ts";
export { parseStrength, PER_EACH_UNIT } from "./strength.ts";
export type { Strength } from "./strength.ts";
export { parseNdc } from "./ndc.ts";
export type { NdcParse } from "./ndc.ts";
export { hasValidCheckDigit, parseBarcode } from "./barcode.ts";
export type { BarcodeParse } from "./barcode.ts";
export { rankLabelImages } from "./dailymed.ts";
export type { LabelMedia } from "./dailymed.ts";

const shared = createLookup();

export function searchByName(query: string, options?: NameSearchOptions): Promise<NameSearchResult> {
  return shared.searchByName(query, options);
}

export function findByNdc(text: string): Promise<CodeLookupResult> {
  return shared.findByNdc(text);
}

export function findByCode(text: string): Promise<CodeLookupResult | null> {
  return shared.findByCode(text);
}

export function findByBarcode(digits: string): Promise<CodeLookupResult> {
  return shared.findByBarcode(digits);
}

export function getLabel(product: IdentifiedProduct): Promise<LabelSections | null> {
  return shared.getLabel(product);
}

export function getLabelImages(product: IdentifiedProduct): Promise<readonly string[]> {
  return shared.getLabelImages(product);
}

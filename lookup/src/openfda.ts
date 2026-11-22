import { MalformedResponseError, StrengthParseError } from "./errors.ts";
import { childRecord, isRecord, numberField, recordArrayField, stringArrayField, stringField } from "./http.ts";
import type { JsonResponse } from "./http.ts";
import { parseStrength } from "./strength.ts";
import { LABEL_SECTION_NAMES } from "./types.ts";
import type { IdentifiedProduct, LabelSections, MatchedBy, ProductIngredient, ProductKind } from "./types.ts";

const NDC_URL = "https://api.fda.gov/drug/ndc.json";
const LABEL_URL = "https://api.fda.gov/drug/label.json";
const DAILYMED_SETID_PAGE = "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=";
const DAILYMED_SEARCH_PAGE = "https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=";
const OTC_MARKER = "OTC";
const NO_INGREDIENTS_NOTE = " The record lists no active ingredients, which is usual for a kit. Open the record to check.";

export interface NdcPackage {
  readonly packageNdc: string;
  readonly description?: string;
}

export interface NdcRecord {
  readonly productNdc: string;
  readonly brandName?: string;
  readonly genericName?: string;
  readonly labelerName?: string;
  readonly dosageForm?: string;
  readonly routes: readonly string[];
  readonly productType?: string;
  readonly activeIngredients: readonly ProductIngredient[];
  readonly packages: readonly NdcPackage[];
  readonly splSetId?: string;
  readonly upcs: readonly string[];
  readonly isOriginalPackager: boolean;
}

export interface NdcPage {
  readonly records: readonly NdcRecord[];
  readonly total: number;
}

export interface LabelRecord {
  readonly setId?: string;
  readonly productNdcs: readonly string[];
  readonly sections: LabelSections;
}

export interface ProductMatch {
  readonly matchedBy: MatchedBy;
  readonly confidenceNote: string;
  readonly packageNdc?: string;
  readonly upc?: string;
}

function quotedGroup(field: string, values: readonly string[]): string {
  return `${field}:(${values.map((value) => `"${value}"`).join(" ")})`;
}

function searchUrl(base: string, search: string, limit: number): string {
  return `${base}?search=${encodeURIComponent(search)}&limit=${limit}`;
}

export function ndcNameSearchUrl(tokens: readonly string[], limit: number): string {
  const allTokens = `(${tokens.join(" AND ")})`;
  return searchUrl(NDC_URL, `finished:true AND (brand_name:${allTokens} generic_name:${allTokens})`, limit);
}

export function ndcByProductUrl(productNdcs: readonly string[], limit: number): string {
  return searchUrl(NDC_URL, quotedGroup("product_ndc", productNdcs), limit);
}

export function ndcByPackageUrl(packageNdcs: readonly string[], limit: number): string {
  return searchUrl(NDC_URL, quotedGroup("packaging.package_ndc", packageNdcs), limit);
}

export function labelByProductNdcUrl(productNdc: string): string {
  return searchUrl(LABEL_URL, quotedGroup("openfda.product_ndc", [productNdc]), 1);
}

export function labelBySetIdUrl(setId: string): string {
  return searchUrl(LABEL_URL, quotedGroup("set_id", [setId]), 1);
}

export function labelByUpcUrl(upc: string, limit: number): string {
  return searchUrl(LABEL_URL, quotedGroup("openfda.upc", [upc]), limit);
}

function results(response: JsonResponse): readonly Record<string, unknown>[] {
  if (!isRecord(response.body)) throw new MalformedResponseError("openfda", response.url, "the body is not an object");
  if (isRecord(response.body["error"])) return [];
  if (!Array.isArray(response.body["results"])) {
    throw new MalformedResponseError("openfda", response.url, "there is no results list and no error block");
  }
  return recordArrayField(response.body, "results");
}

function toIngredient(raw: Record<string, unknown>): ProductIngredient {
  const rawName = stringField(raw, "name") ?? "";
  const strengthText = stringField(raw, "strength");
  if (strengthText === undefined) return { rawName, value: null, unit: "" };
  try {
    return { rawName, ...parseStrength(strengthText), strengthText };
  } catch (error) {
    if (error instanceof StrengthParseError) return { rawName, value: null, unit: "", strengthText };
    throw error;
  }
}

function toPackage(raw: Record<string, unknown>): readonly NdcPackage[] {
  const packageNdc = stringField(raw, "package_ndc");
  const description = stringField(raw, "description");
  if (packageNdc === undefined) return [];
  return [{ packageNdc, ...(description === undefined ? {} : { description }) }];
}

function toNdcRecord(raw: Record<string, unknown>, url: string): NdcRecord {
  const productNdc = stringField(raw, "product_ndc");
  if (productNdc === undefined) throw new MalformedResponseError("openfda", url, "a result has no product_ndc");
  const openfda = childRecord(raw, "openfda");
  const optional = {
    brandName: stringField(raw, "brand_name"),
    genericName: stringField(raw, "generic_name"),
    labelerName: stringField(raw, "labeler_name"),
    dosageForm: stringField(raw, "dosage_form"),
    productType: stringField(raw, "product_type"),
    splSetId: stringArrayField(openfda, "spl_set_id")[0],
  };
  return {
    productNdc,
    routes: stringArrayField(raw, "route"),
    activeIngredients: recordArrayField(raw, "active_ingredients").map(toIngredient),
    packages: recordArrayField(raw, "packaging").flatMap(toPackage),
    upcs: stringArrayField(openfda, "upc"),
    isOriginalPackager: Array.isArray(openfda["is_original_packager"]) && openfda["is_original_packager"].includes(true),
    ...definedOnly(optional),
  };
}

function definedOnly<T extends Record<string, string | undefined>>(fields: T): { [K in keyof T]?: string } {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as { [K in keyof T]?: string };
}

export function toNdcPage(response: JsonResponse): NdcPage {
  const records = results(response).map((raw) => toNdcRecord(raw, response.url));
  const total = numberField(childRecord(childRecord(response.body, "meta"), "results"), "total");
  return { records, total: total ?? records.length };
}

export function toLabelRecords(response: JsonResponse): readonly LabelRecord[] {
  return results(response).map((raw) => {
    const openfda = childRecord(raw, "openfda");
    const setId = stringField(raw, "set_id") ?? stringArrayField(openfda, "spl_set_id")[0];
    const sections = Object.fromEntries(
      LABEL_SECTION_NAMES.map((name) => [name, stringArrayField(raw, name)] as const).filter(([, texts]) => texts.length > 0),
    ) as LabelSections;
    return { productNdcs: stringArrayField(openfda, "product_ndc"), sections, ...(setId === undefined ? {} : { setId }) };
  });
}

export function productKind(productType: string | undefined): ProductKind {
  return productType?.toUpperCase().includes(OTC_MARKER) ? "otc" : "rx";
}

export function drugRecordUrl(splSetId: string | undefined, productNdc: string): string {
  return splSetId === undefined
    ? `${DAILYMED_SEARCH_PAGE}${encodeURIComponent(productNdc)}`
    : `${DAILYMED_SETID_PAGE}${encodeURIComponent(splSetId)}`;
}

export function toDrugProduct(record: NdcRecord, match: ProductMatch): IdentifiedProduct {
  const ingredientNames = record.activeIngredients.map((ingredient) => ingredient.rawName).join(", ");
  const matchedPackage = record.packages.find((item) => item.packageNdc === match.packageNdc);
  const upc = match.upc ?? (record.upcs.length === 1 ? record.upcs[0] : undefined);
  const optional = {
    genericName: record.genericName,
    form: record.dosageForm,
    route: record.routes.length > 0 ? record.routes.join(", ") : undefined,
    packageNdc: matchedPackage?.packageNdc,
    packageDescription: matchedPackage?.description,
    splSetId: record.splSetId,
    upc,
  };
  return {
    source: "openfda",
    kind: productKind(record.productType),
    displayName: record.brandName ?? record.genericName ?? ingredientNames,
    maker: record.labelerName ?? "",
    productNdc: record.productNdc,
    ingredients: record.activeIngredients,
    labelImages: [],
    recordUrl: drugRecordUrl(record.splSetId, record.productNdc),
    matchedBy: match.matchedBy,
    confidenceNote: record.activeIngredients.length === 0 ? `${match.confidenceNote}${NO_INGREDIENTS_NOTE}` : match.confidenceNote,
    ...definedOnly(optional),
  };
}

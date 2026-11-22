import { MalformedResponseError } from "./errors.ts";
import { childRecord, isRecord, numberField, recordArrayField, stringField } from "./http.ts";
import type { JsonResponse } from "./http.ts";
import type { IdentifiedProduct, MatchedBy, ProductIngredient } from "./types.ts";

const DSLD_API_URL = "https://api.ods.od.nih.gov/dsld/v9";
const DSLD_PDF_URL = "https://api.ods.od.nih.gov/dsld/s3/pdf";
const DSLD_PAGE_URL = "https://dsld.od.nih.gov/label";
const OFF_MARKET = 1;
const OFF_MARKET_NOTE = "DSLD marks this label version as off the market.";

export interface SupplementHit {
  readonly id: string;
  readonly fullName: string;
  readonly brandName: string;
  readonly ingredientNames: readonly string[];
  readonly form?: string;
  readonly offMarket: boolean;
  readonly entryDate: string;
}

export interface SupplementPage {
  readonly hits: readonly SupplementHit[];
}

export interface SupplementMatch {
  readonly matchedBy: MatchedBy;
  readonly confidenceNote: string;
}

export function dsldSearchUrl(query: string, size: number): string {
  return `${DSLD_API_URL}/search-filter?q=${encodeURIComponent(query)}&size=${size}`;
}

export function dsldLabelUrl(id: string): string {
  return `${DSLD_API_URL}/label/${encodeURIComponent(id)}`;
}

export function dsldPdfUrl(id: string): string {
  return `${DSLD_PDF_URL}/${encodeURIComponent(id)}.pdf`;
}

export function dsldPageUrl(id: string): string {
  return `${DSLD_PAGE_URL}/${encodeURIComponent(id)}`;
}

function toHit(raw: Record<string, unknown>): readonly SupplementHit[] {
  const id = stringField(raw, "_id");
  const source = childRecord(raw, "_source");
  const fullName = stringField(source, "fullName");
  if (id === undefined || fullName === undefined) return [];
  const form = stringField(childRecord(source, "physicalState"), "langualCodeDescription");
  return [
    {
      id,
      fullName,
      brandName: stringField(source, "brandName") ?? "",
      ingredientNames: recordArrayField(source, "allIngredients").flatMap((item) => stringField(item, "name") ?? []),
      offMarket: source["offMarket"] === OFF_MARKET,
      entryDate: stringField(source, "entryDate") ?? "",
      ...(form === undefined ? {} : { form }),
    },
  ];
}

export function toSupplementPage(response: JsonResponse): SupplementPage {
  if (!isRecord(response.body) || !Array.isArray(response.body["hits"])) {
    throw new MalformedResponseError("dsld", response.url, "there is no hits list");
  }
  return { hits: recordArrayField(response.body, "hits").flatMap(toHit) };
}

function toIngredients(row: Record<string, unknown>): readonly ProductIngredient[] {
  const rawName = stringField(row, "name") ?? "";
  const [amount] = recordArrayField(row, "quantity");
  const value = amount === undefined ? undefined : numberField(amount, "quantity");
  const unit = amount === undefined ? undefined : stringField(amount, "unit");
  const perValue = amount === undefined ? undefined : numberField(amount, "servingSizeQuantity");
  const perUnit = amount === undefined ? undefined : stringField(amount, "servingSizeUnit");
  const declared = value !== undefined && unit !== undefined && value > 0;
  const own: ProductIngredient = {
    rawName,
    value: declared ? value : null,
    unit: declared ? unit : "",
    ...(perValue === undefined || perUnit === undefined ? {} : { per: { value: perValue, unit: perUnit } }),
  };
  return [own, ...recordArrayField(row, "nestedRows").flatMap(toIngredients)];
}

export function upcDigits(label: Record<string, unknown>): string | undefined {
  const digits = (stringField(label, "upcSku") ?? "").replace(/\D/g, "");
  return digits === "" ? undefined : digits;
}

export function toSupplementLabel(response: JsonResponse): Record<string, unknown> {
  if (!isRecord(response.body) || stringField(response.body, "fullName") === undefined) {
    throw new MalformedResponseError("dsld", response.url, "the label has no fullName");
  }
  return response.body;
}

function makerOf(label: Record<string, unknown>): string {
  const [contact] = recordArrayField(label, "contacts");
  return stringField(label, "brandName") ?? stringField(childRecord(contact, "contactDetails"), "name") ?? "";
}

export function toSupplementProduct(id: string, label: Record<string, unknown>, match: SupplementMatch): IdentifiedProduct {
  const form = stringField(childRecord(label, "physicalState"), "langualCodeDescription");
  const upc = upcDigits(label);
  const offMarket = label["offMarket"] === OFF_MARKET;
  const note = offMarket ? `${match.confidenceNote} ${OFF_MARKET_NOTE}` : match.confidenceNote;
  return {
    source: "dsld",
    kind: "supplement",
    displayName: stringField(label, "fullName") ?? "",
    maker: makerOf(label),
    dsldId: id,
    offMarket,
    ingredients: recordArrayField(label, "ingredientRows").flatMap(toIngredients),
    labelImages: [dsldPdfUrl(id)],
    recordUrl: dsldPageUrl(id),
    matchedBy: match.matchedBy,
    confidenceNote: note,
    ...(form === undefined ? {} : { form }),
    ...(upc === undefined ? {} : { upc }),
  };
}

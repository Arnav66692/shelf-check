import { LABEL_SECTION_NAMES } from "../types.ts";
import type { LabelSections, Quantity } from "../types.ts";
import {
  createCachedJsonGetter,
  isRecord,
  recordArrayField,
  ResponseShapeError,
  stringArrayField,
  stringField,
} from "./http.ts";
import type { FetchFn } from "./http.ts";

const OPENFDA_BASE_URL = "https://api.fda.gov/drug";
const STATUS_OK = 200;
const STATUS_NO_MATCH = 404;
const STRENGTH_PATTERN = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*([^\s/]+)\s*(?:\/\s*(\d*\.?\d+)?\s*([^\s/]*))?\s*$/i;
export const PER_EACH_UNIT = "each";

export interface Strength {
  readonly value: number;
  readonly unit: string;
  readonly per: Quantity;
}

export class StrengthParseError extends Error {
  constructor(text: string) {
    super(`Cannot parse strength "${text}". Expected a form such as "500 mg/1" or "12.5 mg/5mL".`);
    this.name = "StrengthParseError";
  }
}

export function parseStrength(text: string): Strength {
  const match = STRENGTH_PATTERN.exec(text);
  const [, rawValue, unit, rawPerValue, rawPerUnit] = match ?? [];
  if (rawValue === undefined || unit === undefined) throw new StrengthParseError(text);
  const value = Number(rawValue);
  const perValue = rawPerValue === undefined ? 1 : Number(rawPerValue);
  if (!Number.isFinite(value) || !Number.isFinite(perValue) || perValue <= 0) throw new StrengthParseError(text);
  const perUnit = rawPerUnit === undefined || rawPerUnit === "" ? PER_EACH_UNIT : rawPerUnit;
  return { value, unit, per: { value: perValue, unit: perUnit } };
}

export interface NdcActiveIngredient {
  readonly name: string;
  readonly strength: string;
}

export interface NdcProduct {
  readonly productNdc: string;
  readonly brandName?: string;
  readonly genericName?: string;
  readonly dosageForm?: string;
  readonly routes?: readonly string[];
  readonly productType?: string;
  readonly splSetIds?: readonly string[];
  readonly activeIngredients: readonly NdcActiveIngredient[];
}

export interface OpenFdaClient {
  getNdcProduct(productNdc: string): Promise<NdcProduct | null>;
  getLabel(productNdc: string): Promise<LabelSections | null>;
  searchNdc(search: string, limit: number): Promise<readonly NdcProduct[]>;
}

export type Environment = Readonly<Record<string, string | undefined>>;

export interface OpenFdaClientOptions {
  readonly fetch?: FetchFn;
  readonly apiKey?: string;
  readonly env?: Environment;
}

export function openFdaApiKeyFromEnv(env: Environment): string | undefined {
  const key = env["OPENFDA_API_KEY"]?.trim();
  return key === undefined || key === "" ? undefined : key;
}

function processEnvironment(): Environment {
  return typeof process === "undefined" ? {} : process.env;
}

function toNdcProduct(raw: Record<string, unknown>): NdcProduct {
  const productNdc = stringField(raw, "product_ndc");
  if (productNdc === undefined) throw new ResponseShapeError("openFDA NDC", "result has no product_ndc");
  const activeIngredients = recordArrayField(raw, "active_ingredients").map((entry) => {
    const name = stringField(entry, "name");
    const strength = stringField(entry, "strength");
    if (name === undefined || strength === undefined) {
      throw new ResponseShapeError("openFDA NDC", `active ingredient of ${productNdc} lacks name or strength`);
    }
    return { name, strength };
  });
  const brandName = stringField(raw, "brand_name");
  const genericName = stringField(raw, "generic_name");
  const dosageForm = stringField(raw, "dosage_form");
  const routes = stringArrayField(raw, "route");
  const productType = stringField(raw, "product_type");
  const splSetIds = isRecord(raw.openfda) ? stringArrayField(raw.openfda, "spl_set_id") : [];
  return {
    productNdc,
    activeIngredients,
    ...(brandName === undefined ? {} : { brandName }),
    ...(genericName === undefined ? {} : { genericName }),
    ...(dosageForm === undefined ? {} : { dosageForm }),
    ...(routes.length ? { routes } : {}),
    ...(productType === undefined ? {} : { productType }),
    ...(splSetIds.length ? { splSetIds } : {}),
  };
}

function toLabelSections(raw: Record<string, unknown>): LabelSections {
  const entries = LABEL_SECTION_NAMES.map((name) => [name, stringArrayField(raw, name)] as const).filter(
    ([, paragraphs]) => paragraphs.length > 0,
  );
  return Object.fromEntries(entries);
}

function resultsOf(source: string, body: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body["results"])) {
    throw new ResponseShapeError(source, "missing results array");
  }
  return recordArrayField(body, "results");
}

export function ndcSearchUrl(search: string, limit: number): string {
  return `${OPENFDA_BASE_URL}/ndc.json?search=${encodeURIComponent(search)}&limit=${limit}`;
}

export function labelSearchUrl(search: string, limit: number): string {
  return `${OPENFDA_BASE_URL}/label.json?search=${encodeURIComponent(search)}&limit=${limit}`;
}

export function createOpenFdaClient(options: OpenFdaClientOptions = {}): OpenFdaClient {
  const apiKey = options.apiKey ?? openFdaApiKeyFromEnv(options.env ?? processEnvironment());
  const getJson = createCachedJsonGetter({
    fetch: options.fetch ?? fetch,
    acceptedStatuses: [STATUS_OK, STATUS_NO_MATCH],
    ...(apiKey === undefined || apiKey === ""
      ? {}
      : { decorateUrl: (url: string) => `${url}&api_key=${encodeURIComponent(apiKey)}` }),
  });

  const searchNdc = async (search: string, limit: number): Promise<readonly NdcProduct[]> => {
    const { status, body } = await getJson(ndcSearchUrl(search, limit));
    return status === STATUS_NO_MATCH ? [] : resultsOf("openFDA NDC", body).map(toNdcProduct);
  };

  return {
    searchNdc,
    async getNdcProduct(productNdc) {
      const [product] = await searchNdc(`product_ndc:"${productNdc}"`, 1);
      return product ?? null;
    },
    async getLabel(productNdc) {
      const { status, body } = await getJson(labelSearchUrl(`openfda.product_ndc:"${productNdc}"`, 1));
      if (status === STATUS_NO_MATCH) return null;
      const [label] = resultsOf("openFDA label", body);
      return label === undefined ? null : toLabelSections(label);
    },
  };
}

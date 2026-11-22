import { findByBarcode, findByCode, findByNdc } from "./codes.ts";
import { createCachedJsonGetter, STATUS_NOT_FOUND, STATUS_OK } from "./http.ts";
import type { FetchFn } from "./http.ts";
import { getLabel, getLabelImages } from "./labels.ts";
import { searchByName } from "./search.ts";
import type { Sources } from "./search.ts";
import type { CodeLookupResult, IdentifiedProduct, LabelSections, NameSearchOptions, NameSearchResult } from "./types.ts";

export type Environment = Readonly<Record<string, string | undefined>>;

export interface LookupOptions {
  readonly fetch?: FetchFn;
  readonly apiKey?: string;
  readonly env?: Environment;
}

export interface Lookup {
  searchByName(query: string, options?: NameSearchOptions): Promise<NameSearchResult>;
  findByNdc(text: string): Promise<CodeLookupResult>;
  findByBarcode(digits: string): Promise<CodeLookupResult>;
  getLabel(product: IdentifiedProduct): Promise<LabelSections | null>;
  getLabelImages(product: IdentifiedProduct): Promise<readonly string[]>;
}

export function openFdaApiKeyFromEnv(env: Environment): string | undefined {
  const key = env["OPENFDA_API_KEY"]?.trim();
  return key === undefined || key === "" ? undefined : key;
}

function processEnvironment(): Environment {
  return typeof process === "undefined" ? {} : process.env;
}

function createSources(options: LookupOptions): Sources {
  const fetchFn: FetchFn = options.fetch ?? ((url, init) => fetch(url, init));
  const apiKey = options.apiKey ?? openFdaApiKeyFromEnv(options.env ?? processEnvironment());
  return {
    openfda: createCachedJsonGetter({
      source: "openfda",
      fetch: fetchFn,
      acceptedStatuses: [STATUS_OK, STATUS_NOT_FOUND],
      ...(apiKey === undefined ? {} : { decorateUrl: (url: string) => `${url}&api_key=${encodeURIComponent(apiKey)}` }),
    }),
    rxnav: createCachedJsonGetter({ source: "rxnav", fetch: fetchFn, acceptedStatuses: [STATUS_OK] }),
    dailymed: createCachedJsonGetter({ source: "dailymed", fetch: fetchFn, acceptedStatuses: [STATUS_OK] }),
    dsld: createCachedJsonGetter({ source: "dsld", fetch: fetchFn, acceptedStatuses: [STATUS_OK] }),
  };
}

export function createLookup(options: LookupOptions = {}): Lookup & {
  findByCode(text: string): Promise<CodeLookupResult | null>;
} {
  const sources = createSources(options);
  return {
    searchByName: (query, searchOptions) => searchByName(sources, query, searchOptions),
    findByNdc: (text) => findByNdc(sources, text),
    findByCode: (text) => findByCode(sources, text),
    findByBarcode: (digits) => findByBarcode(sources, digits),
    getLabel: (product) => getLabel(sources, product),
    getLabelImages: (product) => getLabelImages(sources, product),
  };
}

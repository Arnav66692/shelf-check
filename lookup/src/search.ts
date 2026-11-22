import { LookupError } from "./errors.ts";
import { dsldLabelUrl, dsldSearchUrl, toSupplementLabel, toSupplementPage, toSupplementProduct } from "./dsld.ts";
import type { SupplementHit, SupplementMatch } from "./dsld.ts";
import { unique } from "./http.ts";
import type { JsonGetter } from "./http.ts";
import { ndcNameSearchUrl, toDrugProduct, toNdcPage } from "./openfda.ts";
import { correctedQuery, matchesReleaseForm, parseQuery, supplementForm, withoutReleaseDescriptor } from "./query.ts";
import type { ParsedQuery } from "./query.ts";
import { groupProducts, listingCandidate, mergeRanked, namesEveryWord, scoreCandidate } from "./ranking.ts";
import type { NamedListing } from "./ranking.ts";
import { approximateTermUrl, baseIngredientsUrl, spellingUrl, toApproximateRxcuis, toIngredientNames, toSpellingSuggestions } from "./rxnav.ts";
import type { IdentifiedProduct, NameSearchOptions, NameSearchResult } from "./types.ts";

export interface Sources {
  readonly openfda: JsonGetter;
  readonly rxnav: JsonGetter;
  readonly dailymed: JsonGetter;
  readonly dsld: JsonGetter;
}

const DEFAULT_LIMIT = 10;
const DRUG_PAGE_SIZE = 100;
const SUPPLEMENT_PAGE_SIZE = 25;
const SUPPLEMENT_DETAIL_LIMIT = 8;
const DRUG_NAME_NOTE = "Matched by name. Check the maker, strength and form against the package.";
const SUPPLEMENT_NAME_NOTE = "Matched by name in the NIH supplement label database. Check the brand and the amount per serving.";

export type Settled<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: LookupError };

export async function settle<T>(work: Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await work };
  } catch (error) {
    if (error instanceof LookupError) return { ok: false, error };
    throw error;
  }
}

interface DrugSearch {
  readonly products: readonly IdentifiedProduct[];
  readonly total: number;
  readonly correctedTokens?: readonly string[];
}

async function drugPage(sources: Sources, tokens: readonly string[], forms: readonly string[]): Promise<DrugSearch> {
  const page = toNdcPage(await sources.openfda(ndcNameSearchUrl(tokens, DRUG_PAGE_SIZE, forms)));
  const originalMakersFirst = [...page.records].sort(
    (left, right) => Number(right.isOriginalPackager) - Number(left.isOriginalPackager),
  );
  const products = originalMakersFirst.map((record) => toDrugProduct(record, { matchedBy: "name", confidenceNote: DRUG_NAME_NOTE }));
  return { products, total: page.total };
}

async function spellingCorrection(sources: Sources, tokens: readonly string[]): Promise<readonly string[]> {
  const term = tokens.join(" ");
  const [suggestion] = toSpellingSuggestions(await sources.rxnav(spellingUrl(term)));
  if (suggestion !== undefined) return parseQuery(suggestion).nameTokens;
  const [rxcui] = toApproximateRxcuis(await sources.rxnav(approximateTermUrl(term)));
  if (rxcui === undefined) return [];
  const names = toIngredientNames(await sources.rxnav(baseIngredientsUrl(rxcui)));
  return unique(names.flatMap((name) => parseQuery(name).nameTokens));
}

async function searchDrugs(sources: Sources, query: ParsedQuery): Promise<DrugSearch> {
  const first = await drugPage(sources, query.nameTokens, query.forms);
  if (first.products.length > 0) return first;
  const correctedTokens = await spellingCorrection(sources, query.nameTokens);
  if (correctedTokens.length === 0 || correctedTokens.join(" ") === query.nameTokens.join(" ")) return first;
  return { ...(await drugPage(sources, correctedTokens, query.forms)), correctedTokens };
}

function newestOnMarketFirst(left: SupplementHit, right: SupplementHit): number {
  return Number(left.offMarket) - Number(right.offMarket) || right.entryDate.localeCompare(left.entryDate);
}

function toListing(hit: SupplementHit): NamedListing {
  return {
    name: hit.fullName,
    otherNames: `${hit.brandName} ${hit.ingredientNames.join(" ")}`,
    form: supplementForm(hit.form, hit.fullName),
    offMarket: hit.offMarket,
  };
}

export function pickSupplementHits(hits: readonly SupplementHit[], query: ParsedQuery, count: number): readonly SupplementHit[] {
  const versions = hits.reduce<ReadonlyMap<string, SupplementHit>>((kept, hit) => {
    const key = `${hit.brandName}|${hit.fullName}|${hit.form ?? ""}`.toLowerCase();
    const current = kept.get(key);
    return current !== undefined && newestOnMarketFirst(current, hit) <= 0 ? kept : new Map([...kept, [key, hit]]);
  }, new Map());
  return [...versions.values()]
    .map((hit) => ({ hit, candidate: listingCandidate(toListing(hit)) }))
    .filter(({ candidate }) => namesEveryWord(candidate, query) && matchesReleaseForm(query, candidate.form))
    .map(({ hit, candidate }, index) => ({ hit, index, score: scoreCandidate(candidate, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, count)
    .map(({ hit }) => hit);
}

export async function supplementProduct(sources: Sources, id: string, match: SupplementMatch): Promise<IdentifiedProduct> {
  return toSupplementProduct(id, toSupplementLabel(await sources.dsld(dsldLabelUrl(id))), match);
}

async function searchSupplements(sources: Sources, query: ParsedQuery, limit: number) {
  async function matchingHits(text: string) {
    const page = toSupplementPage(await sources.dsld(dsldSearchUrl(text, SUPPLEMENT_PAGE_SIZE)));
    return pickSupplementHits(page.hits, query, Math.min(limit, SUPPLEMENT_DETAIL_LIMIT));
  }
  let chosen = await matchingHits(query.text);
  if (chosen.length === 0) {
    const broaderText = withoutReleaseDescriptor(query.text);
    if (broaderText !== query.text) chosen = await matchingHits(broaderText);
  }
  const match: SupplementMatch = { matchedBy: "name", confidenceNote: SUPPLEMENT_NAME_NOTE };
  const details = await Promise.all(chosen.map((hit) => settle(supplementProduct(sources, hit.id, match))));
  const products = details.flatMap((detail) => detail.ok ? [detail.value] : []);
  const errors = details.flatMap((detail) => detail.ok ? [] : [detail.error]);
  if (products.length === 0 && errors[0] !== undefined) throw errors[0];
  return { products, errors };
}

function emptyResult(query: string): NameSearchResult {
  return { query, groups: [], drugMatchTotal: 0, sourceErrors: [] };
}

// What people type for the products on their shelf, in the words the labels use.
const EVERYDAY_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:baby|low[- ]dose|low[- ]strength) aspirin\b/gi, "aspirin 81 mg"],
  [/\bchildren['’]s\b/gi, "childrens"],
  [/\b(?:kids?['’]?s?|child['’]?s?)\b(?=\s+\w)/gi, "childrens"],
  [/\binfant(?:['’]?s)?\b/gi, "infants"],
  [/\bvitamin d\b(?!\s*\d)/gi, "vitamin d3"],
];

export function everydayWords(text: string): string {
  return EVERYDAY_WORDS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

export async function searchByName(sources: Sources, text: string, options: NameSearchOptions = {}): Promise<NameSearchResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const typed = parseQuery(everydayWords(text));
  if (typed.nameTokens.length === 0 || limit <= 0) return emptyResult(typed.text);

  const [drugs, firstSupplements] = await Promise.all([
    settle(searchDrugs(sources, typed)),
    settle(searchSupplements(sources, typed, limit)),
  ]);
  const correctedTokens = drugs.ok ? drugs.value.correctedTokens : undefined;
  const query = correctedTokens === undefined ? typed : correctedQuery(typed, correctedTokens);
  const retrySupplements = correctedTokens !== undefined && firstSupplements.ok && firstSupplements.value.products.length === 0;
  const supplements = retrySupplements ? await settle(searchSupplements(sources, query, limit)) : firstSupplements;

  if (!drugs.ok && !supplements.ok) throw drugs.error;
  const sourceErrors = [
    ...(drugs.ok ? [] : [drugs.error]),
    ...(supplements.ok ? supplements.value.errors : [supplements.error]),
  ];

  const drugGroups = groupProducts(drugs.ok ? drugs.value.products : [], query);
  const supplementGroups = groupProducts(supplements.ok ? supplements.value.products : [], query);
  return {
    query: typed.text,
    groups: mergeRanked([drugGroups, supplementGroups], limit),
    drugMatchTotal: drugs.ok ? drugs.value.total : 0,
    sourceErrors,
    ...(correctedTokens === undefined ? {} : { correctedQuery: query.text }),
  };
}

import { comparableToken, formMatches, parseQuery, tokenize } from "./query.ts";
import type { ParsedQuery } from "./query.ts";
import { sameAmount, toMilligrams } from "./strength.ts";
import type { IdentifiedProduct, ProductGroup, ProductIngredient, Quantity } from "./types.ts";

const BRAND_WEIGHT = 3;
const GENERIC_WEIGHT = 1;
const STRENGTH_HIT = 2;
const STRENGTH_MISS = -1;
const FORM_HIT = 1;
const FORM_MISS = -0.5;
const EXTRA_WORD_PENALTY = 0.2;
const MAX_EXTRA_WORDS = 10;
const MAKER_BONUS_PER_TENFOLD = 0.05;
const MAX_MAKER_BONUS = 0.15;
const OFF_MARKET_PENALTY = 0.5;
const HOMEOPATHIC_PENALTY = 0.5;
const HOMEOPATHIC_UNIT_PREFIX = "[hp_";
const COSMETIC_FORM_PARTS: ReadonlySet<string> = new Set(["film coated", "sugar coated", "coated"]);

export interface Candidate {
  readonly name: string;
  readonly otherNames: string;
  readonly form?: string;
  readonly amounts: readonly Quantity[];
  readonly penalty: number;
}

function comparableTokens(text: string): ReadonlySet<string> {
  return new Set(tokenize(text).map(comparableToken));
}

export function scoreCandidate(candidate: Candidate, query: ParsedQuery): number {
  const wanted = query.nameTokens.map(comparableToken);
  const brandTokens = new Set(parseQuery(candidate.name).nameTokens.map(comparableToken));
  const otherTokens = comparableTokens(candidate.otherNames);
  const brandHits = wanted.filter((token) => brandTokens.has(token)).length;
  const otherHits = wanted.filter((token) => !brandTokens.has(token) && otherTokens.has(token)).length;
  const extraWords = [...brandTokens].filter((token) => !wanted.includes(token)).length;
  const strength = query.strength;
  const strengthScore =
    strength === undefined ? 0 : candidate.amounts.some((amount) => sameAmount(amount, strength)) ? STRENGTH_HIT : STRENGTH_MISS;
  const form = candidate.form;
  const formScore =
    query.forms.length === 0 || form === undefined
      ? 0
      : query.forms.some((wantedForm) => formMatches(wantedForm, form))
        ? FORM_HIT
        : FORM_MISS;
  const nameScore = wanted.length === 0 ? 0 : (BRAND_WEIGHT * brandHits + GENERIC_WEIGHT * otherHits) / wanted.length;
  return nameScore + strengthScore + formScore - EXTRA_WORD_PENALTY * Math.min(extraWords, MAX_EXTRA_WORDS) - candidate.penalty;
}

function declaredAmount(ingredient: ProductIngredient): readonly Quantity[] {
  return ingredient.value === null ? [] : [{ value: ingredient.value, unit: ingredient.unit }];
}

export function productCandidate(product: IdentifiedProduct): Candidate {
  const ingredientNames = product.ingredients.map((ingredient) => ingredient.rawName).join(" ");
  return {
    name: product.displayName,
    otherNames: `${product.genericName ?? ""} ${ingredientNames} ${product.maker}`,
    amounts: product.ingredients.flatMap(declaredAmount),
    penalty:
      (product.offMarket === true ? OFF_MARKET_PENALTY : 0) +
      (product.ingredients.some((ingredient) => ingredient.unit.startsWith(HOMEOPATHIC_UNIT_PREFIX)) ? HOMEOPATHIC_PENALTY : 0),
    ...(product.form === undefined ? {} : { form: product.form }),
  };
}

export function namesEveryWord(candidate: Candidate, query: ParsedQuery): boolean {
  const known = new Set([...comparableTokens(candidate.name), ...comparableTokens(candidate.otherNames)]);
  return query.nameTokens.every((token) => known.has(comparableToken(token)));
}

export interface NamedListing {
  readonly name: string;
  readonly otherNames: string;
  readonly form: string | undefined;
  readonly offMarket: boolean;
}

export function listingCandidate(listing: NamedListing): Candidate {
  const strength = parseQuery(listing.name).strength;
  return {
    name: listing.name,
    otherNames: listing.otherNames,
    amounts: strength === undefined ? [] : [strength],
    penalty: listing.offMarket ? OFF_MARKET_PENALTY : 0,
    ...(listing.form === undefined ? {} : { form: listing.form }),
  };
}

function formKey(form: string | undefined): string {
  return (form ?? "")
    .toLowerCase()
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !COSMETIC_FORM_PARTS.has(part))
    .join(",");
}

function amountKey(ingredient: ProductIngredient): string {
  if (ingredient.value === null) return "?";
  const milligrams = toMilligrams({ value: ingredient.value, unit: ingredient.unit });
  const amount = milligrams === null ? `${ingredient.value}${ingredient.unit.toLowerCase()}` : `${milligrams}mg`;
  return ingredient.per === undefined ? amount : `${amount}/${ingredient.per.value}${ingredient.per.unit.toLowerCase()}`;
}

export function compositionKey(product: IdentifiedProduct): string {
  if (product.ingredients.length === 0) {
    return `${product.source}|alone|${product.productNdc ?? product.dsldId ?? product.displayName}`;
  }
  const ingredients = product.ingredients
    .map((ingredient) => `${ingredient.rawName.toLowerCase().replace(/\s+/g, " ").trim()}=${amountKey(ingredient)}`)
    .sort()
    .join(";");
  return `${product.kind}|${formKey(product.form)}|${ingredients}`;
}

interface ScoredGroup {
  readonly group: ProductGroup;
  readonly score: number;
}

function makerBonus(makerCount: number): number {
  return Math.min(MAX_MAKER_BONUS, MAKER_BONUS_PER_TENFOLD * Math.log10(Math.max(makerCount, 1)));
}

function toScoredGroup(products: readonly IdentifiedProduct[], query: ParsedQuery): ScoredGroup {
  const ranked = products
    .map((product, index) => ({ product, index, score: scoreCandidate(productCandidate(product), query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const [best] = ranked;
  if (best === undefined) throw new RangeError("A product group needs at least one product.");
  const makerCount = new Set(products.map((product) => product.maker.toLowerCase())).size;
  return {
    group: { product: best.product, makerCount, members: ranked.map((entry) => entry.product) },
    score: best.score + makerBonus(makerCount),
  };
}

export function groupProducts(products: readonly IdentifiedProduct[], query: ParsedQuery): readonly ScoredGroup[] {
  const byKey = products.reduce<ReadonlyMap<string, readonly IdentifiedProduct[]>>((groups, product) => {
    const key = compositionKey(product);
    return new Map([...groups, [key, [...(groups.get(key) ?? []), product]]]);
  }, new Map());
  return [...byKey.values()]
    .map((members) => toScoredGroup(members, query))
    .map((scored, index) => ({ scored, index }))
    .sort((left, right) => right.scored.score - left.scored.score || left.index - right.index)
    .map(({ scored }) => scored);
}

export function mergeRanked(sources: readonly (readonly ScoredGroup[])[], limit: number): readonly ProductGroup[] {
  return sources
    .flatMap((groups, sourceOrder) => groups.map((scored, position) => ({ scored, position, sourceOrder })))
    .sort(
      (left, right) =>
        right.scored.score - left.scored.score || left.position - right.position || left.sourceOrder - right.sourceOrder,
    )
    .slice(0, limit)
    .map(({ scored }) => scored.group);
}

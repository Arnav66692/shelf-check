import { comparableToken, EXTENDED_RELEASE, formMatches, matchesReleaseForm, parseQuery, supplementForm, tokenize } from "./query.ts";
import type { NamedAmount, ParsedQuery } from "./query.ts";
import { sameAmount, toMilligrams } from "./strength.ts";
import type { DeclaredAmount } from "./strength.ts";
import type { IdentifiedProduct, ProductGroup, ProductIngredient } from "./types.ts";

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
  readonly route?: string;
  readonly amounts: readonly (DeclaredAmount & { readonly ingredientTokens?: readonly string[] })[];
  readonly penalty: number;
}

function comparableTokens(text: string): ReadonlySet<string> {
  return new Set(tokenize(text).map(comparableToken));
}

function matchesNamedAmount(candidate: Candidate, wanted: NamedAmount): boolean {
  return candidate.amounts.some((amount) => {
    if (!sameAmount(amount, wanted) || !amount.ingredientTokens) return false;
    const name = amount.ingredientTokens;
    return wanted.ingredientTokens.some((_, start, words) =>
      words.slice(start).every((token, index) => name[index] === token),
    );
  });
}

function scoreStrength(candidate: Candidate, query: ParsedQuery): number {
  if (query.strengths?.length) {
    const hits = query.strengths.filter((wanted) => matchesNamedAmount(candidate, wanted)).length;
    return STRENGTH_MISS + (STRENGTH_HIT - STRENGTH_MISS) * hits / query.strengths.length;
  }
  const strength = query.strength;
  if (!strength) return 0;
  return candidate.amounts.some((amount) => sameAmount(amount, strength)) ? STRENGTH_HIT : STRENGTH_MISS;
}

const CHILD_WORD = /^(?:infants?|child(?:ren)?s?|pediatric|kids?|junior|jr)$/i;
const CHILD_ONLY_PENALTY = EXTRA_WORD_PENALTY * 2;
const INJECTION_PENALTY = EXTRA_WORD_PENALTY * 3;

export function scoreCandidate(candidate: Candidate, query: ParsedQuery): number {
  const wanted = query.nameTokens.map(comparableToken);
  const productName = parseQuery(candidate.name);
  const brandTokens = new Set(productName.nameTokens.map(comparableToken));
  const otherTokens = comparableTokens(candidate.otherNames);
  const brandHits = wanted.filter((token) => brandTokens.has(token)).length;
  const otherHits = wanted.filter((token) => !brandTokens.has(token) && otherTokens.has(token)).length;
  const extraRelease = productName.forms.includes(EXTENDED_RELEASE) && !query.forms.includes(EXTENDED_RELEASE);
  const extraWords = [...brandTokens].filter((token) => !wanted.includes(token)).length + Number(extraRelease);
  const strengthScore = scoreStrength(candidate, query);
  const form = candidate.form;
  const dosageForms = query.forms.filter((wantedForm) => wantedForm !== EXTENDED_RELEASE);
  const formScore =
    dosageForms.length === 0 || form === undefined
      ? 0
      : dosageForms.some((wantedForm) => formMatches(wantedForm, form))
        ? FORM_HIT
        : FORM_MISS;
  const nameScore = wanted.length === 0 ? 0 : (BRAND_WEIGHT * brandHits + GENERIC_WEIGHT * otherHits) / wanted.length;
  // Adult products come first unless the search asks for a child's version.
  const childOnly = [...brandTokens].some((token) => CHILD_WORD.test(token)) && !wanted.some((token) => CHILD_WORD.test(token));
  // Most people search for what they take at home, so a hospital-only route comes later unless asked for.
  const clinicOnly = dosageForms.length === 0 && /\b(?:intravenous|intramuscular|epidural|intrathecal|intra-?arterial)\b/i.test(candidate.route ?? "") &&
    !/\bsubcutaneous\b/i.test(candidate.route ?? "") && !/\b(?:iv|injection|injectable|vial|shot)\b/i.test(query.text);
  return nameScore + strengthScore + formScore - EXTRA_WORD_PENALTY * Math.min(extraWords, MAX_EXTRA_WORDS) -
    (childOnly ? CHILD_ONLY_PENALTY : 0) - (clinicOnly ? INJECTION_PENALTY : 0) - candidate.penalty;
}

function declaredAmount(ingredient: ProductIngredient): readonly NamedAmount[] {
  if (ingredient.value === null) return [];
  return [{
    value: ingredient.value,
    unit: ingredient.unit,
    ingredientTokens: tokenize(ingredient.rawName),
    ...(ingredient.per === undefined ? {} : { per: ingredient.per }),
  }];
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
    ...(product.route === undefined ? {} : { route: product.route }),
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
  const { strength, strengths } = parseQuery(listing.name);
  return {
    name: listing.name,
    otherNames: listing.otherNames,
    amounts: strengths ?? (strength === undefined ? [] : [strength]),
    penalty: listing.offMarket ? OFF_MARKET_PENALTY : 0,
    ...(listing.form === undefined ? {} : { form: listing.form }),
  };
}

function matchingForm(product: IdentifiedProduct): string | undefined {
  return product.source === "dsld" ? supplementForm(product.form, product.displayName) : product.form;
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
  return `${product.kind}|${formKey(matchingForm(product))}|${ingredients}`;
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

// The formula sold most often under a brand name ("tylenol" is plain acetaminophen,
// "nyquil" is the cold and flu formula) comes before its one-off variants.
const MAIN_FORMULA_BONUS = 0.3;

function formulaKey(product: IdentifiedProduct): string {
  return product.ingredients.map((ingredient) => ingredient.rawName.toLowerCase().trim().split(/\s+/)[0]).sort().join("+");
}

export function groupProducts(products: readonly IdentifiedProduct[], query: ParsedQuery): readonly ScoredGroup[] {
  const kept = products.filter((product) => matchesReleaseForm(query, matchingForm(product)));
  const byKey = kept.reduce<ReadonlyMap<string, readonly IdentifiedProduct[]>>((groups, product) => {
    const key = compositionKey(product);
    return new Map([...groups, [key, [...(groups.get(key) ?? []), product]]]);
  }, new Map());
  const formulaCounts = kept.reduce<ReadonlyMap<string, number>>(
    (counts, product) => new Map([...counts, [formulaKey(product), (counts.get(formulaKey(product)) ?? 0) + 1]]), new Map());
  const counts = [...formulaCounts.entries()].filter(([key]) => key !== "").map(([, count]) => count);
  const top = counts.length > 0 ? Math.max(...counts) : 0;
  const mainFormulas = new Set([...formulaCounts.entries()].filter(([key, count]) => key !== "" && count === top && top > 1).map(([key]) => key));
  return [...byKey.values()]
    .map((members) => {
      const scored = toScoredGroup(members, query);
      const [first] = members;
      return first && mainFormulas.has(formulaKey(first)) ? { ...scored, score: scored.score + MAIN_FORMULA_BONUS } : scored;
    })
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

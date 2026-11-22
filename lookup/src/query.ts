import { PER_EACH_UNIT } from "./strength.ts";
import type { DeclaredAmount } from "./strength.ts";

export interface NamedAmount extends DeclaredAmount {
  readonly ingredientTokens: readonly string[];
}

export interface ParsedQuery {
  readonly text: string;
  readonly nameTokens: readonly string[];
  readonly strength?: DeclaredAmount;
  readonly strengths?: readonly NamedAmount[];
  readonly forms: readonly string[];
}

const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`;
const MASS_UNIT = "(?:mcg|[µμu]g|kg|mg|g)";
const UNIT = `(?:${MASS_UNIT}|[dµμmu]?l|iu|%)`;
const PER_UNIT = `(?:${UNIT}|each|tablets?|caplets?|capsules?|pills?)`;
const PAIRED_DOSES = new RegExp(
  String.raw`(?<![a-z\d.])(?:${NUMBER}\s*(?:${MASS_UNIT}\s*)?/\s*)+${NUMBER}\s*(${MASS_UNIT})(?![a-z0-9])`,
);
const DENOMINATOR = String.raw`\s*(?:/|\bper\b)\s*(?=${NUMBER}|${PER_UNIT}(?![a-z0-9]))(${NUMBER})?\s*(${PER_UNIT}(?![a-z0-9]))?`;
const LEADING_DENOMINATOR = new RegExp(`^${DENOMINATOR}`);
const STRENGTH_PATTERN = new RegExp(
  String.raw`(?<![\d.])(${NUMBER})\s*(${UNIT})(?![a-z0-9])(?:${DENOMINATOR})?`,
  "g",
);
const QUERY_OPERATORS: ReadonlySet<string> = new Set(["and", "or", "not"]);
export const EXTENDED_RELEASE = "extended release";
const RELEASE_DESCRIPTOR = /\b(?:(?:extended|timed?)[\s\p{Pd}]+release|er|xr)\b/giu;

const FORM_BY_WORD: Readonly<Record<string, string>> = {
  er: EXTENDED_RELEASE,
  tablet: "tablet",
  tablets: "tablet",
  caplet: "tablet",
  caplets: "tablet",
  capsule: "capsule",
  capsules: "capsule",
  gelcap: "capsule",
  gelcaps: "capsule",
  softgel: "capsule",
  softgels: "capsule",
  liquid: "liquid",
  syrup: "liquid",
  solution: "liquid",
  suspension: "liquid",
  elixir: "liquid",
  gummy: "gummy",
  gummies: "gummy",
  chewable: "chewable",
  chewables: "chewable",
  cream: "cream",
  ointment: "ointment",
  spray: "spray",
  drops: "drops",
  powder: "powder",
  patch: "patch",
  patches: "patch",
  lozenge: "lozenge",
  lozenges: "lozenge",
};

const FORM_MATCHERS: Readonly<Record<string, readonly string[]>> = {
  tablet: ["tablet", "caplet", "pill"],
  capsule: ["capsule", "softgel", "gelcap"],
  liquid: ["liquid", "solution", "suspension", "syrup", "elixir"],
  gummy: ["gummy", "gummies", "chewable"],
  chewable: ["chewable", "gummy", "gummies"],
};

export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, " ")
    .split(" ")
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token !== "");
}

export function comparableToken(token: string): string {
  return token.replace(/'/g, "");
}

function isNameToken(word: string): boolean {
  return FORM_BY_WORD[word] === undefined && !QUERY_OPERATORS.has(word);
}

function expandPairedDoses(text: string): string {
  const match = PAIRED_DOSES.exec(text);
  if (!match) return text;
  const doses = match[0].split("/").map((dose) => dose.trim());
  const includesFirstUnit = /[a-z]/.test(doses[0] ?? "");
  const before = text.slice(0, match.index).trim();
  let names = before.split(/\s*(?:[/+,]|\band\b)\s*/);
  if (names.length === 1 && !includesFirstUnit) names = before.split(/\s+/);
  const paired = names.length === doses.length;
  if (!paired && includesFirstUnit) return text;
  const after = text.slice(match.index + match[0].length);
  const denominator = LEADING_DENOMINATOR.exec(after)?.[0] ?? "";
  const expanded = doses.map((dose, index) => {
    const numerator = /[a-z]/.test(dose) ? dose : `${dose} ${match[1]}`;
    return (paired ? `${names[index]} ` : "") + numerator + denominator;
  });
  return (paired ? "" : before + " ") + expanded.join(" + ") + after.slice(denominator.length);
}

function normalizeReleaseText(text: string): string {
  return text.replace(RELEASE_DESCRIPTOR, "er");
}

export function withoutReleaseDescriptor(text: string): string {
  return text.replace(RELEASE_DESCRIPTOR, " ").replace(/\s+/g, " ").trim();
}

export function parseQuery(query: string): ParsedQuery {
  const text = query.trim().replace(/\s+/g, " ");
  const lowered = expandPairedDoses(normalizeReleaseText(text.toLowerCase()));
  const matches = [...lowered.matchAll(STRENGTH_PATTERN)];
  const words = tokenize(lowered.replace(STRENGTH_PATTERN, " "));
  const namesAfterStrength = matches[0]?.index === 0;
  const strengths = matches.map((match, index) => {
    const [, value, unit, perValue, perUnit] = match;
    const previous = matches[index - 1];
    const before = previous === undefined ? 0 : previous.index + previous[0].length;
    const ingredientText = namesAfterStrength
      ? lowered.slice(match.index + match[0].length, matches[index + 1]?.index)
      : lowered.slice(before, match.index);
    return {
      ingredientTokens: tokenize(ingredientText).filter(isNameToken),
      value: Number(value),
      unit: unit!,
      ...(perValue === undefined && perUnit === undefined
        ? {}
        : { per: { value: Number(perValue ?? 1), unit: perUnit ?? PER_EACH_UNIT } }),
    };
  });
  const [first] = strengths;
  return {
    text,
    nameTokens: words.filter(isNameToken),
    forms: [...new Set(words.flatMap((word) => FORM_BY_WORD[word] ?? []))],
    ...(first === undefined ? {} : { strength: { value: first.value, unit: first.unit, ...(first.per && { per: first.per }) } }),
    ...(strengths.length > 1 ? { strengths } : {}),
  };
}

export function correctedQuery(query: ParsedQuery, tokens: readonly string[]): ParsedQuery {
  const nameText = query.text.replace(new RegExp(STRENGTH_PATTERN, "gi"), (strength) => " ".repeat(strength.length));
  let nameIndex = 0;
  let position = 0;
  let text = "";
  for (const word of nameText.matchAll(/[a-z0-9]+(?:'[a-z0-9]+)*/gi)) {
    if (word[0].toLowerCase() !== query.nameTokens[nameIndex]) continue;
    const replacement = nameIndex === query.nameTokens.length - 1 ? tokens.slice(nameIndex).join(" ") : tokens[nameIndex] ?? "";
    text += query.text.slice(position, word.index) + replacement;
    position = word.index + word[0].length;
    nameIndex++;
  }
  return parseQuery(text + query.text.slice(position));
}

export function formMatches(queryForm: string, productForm: string): boolean {
  if (queryForm === EXTENDED_RELEASE) return tokenize(normalizeReleaseText(productForm)).includes("er");
  const lowered = productForm.toLowerCase();
  return (FORM_MATCHERS[queryForm] ?? [queryForm]).some((word) => lowered.includes(word));
}

export function matchesReleaseForm(query: ParsedQuery, form: string | undefined): boolean {
  return !query.forms.includes(EXTENDED_RELEASE) || (form !== undefined && formMatches(EXTENDED_RELEASE, form));
}

export function supplementForm(form: string | undefined, fullName: string): string | undefined {
  if (!formMatches(EXTENDED_RELEASE, fullName) || (form && formMatches(EXTENDED_RELEASE, form))) return form;
  return form ? `${form}, ${EXTENDED_RELEASE}` : EXTENDED_RELEASE;
}

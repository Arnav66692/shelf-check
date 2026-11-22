import type { Quantity } from "./types.ts";

export interface ParsedQuery {
  readonly text: string;
  readonly nameTokens: readonly string[];
  readonly strength?: Quantity;
  readonly forms: readonly string[];
}

const STRENGTH_PATTERN = /(\d+(?:\.\d+)?)\s*(mcg|µg|μg|ug|mg|ml|iu|g|%)(?![a-z0-9])/g;
const QUERY_OPERATORS: ReadonlySet<string> = new Set(["and", "or", "not"]);

const FORM_BY_WORD: Readonly<Record<string, string>> = {
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

export function parseQuery(query: string): ParsedQuery {
  const text = query.trim().replace(/\s+/g, " ");
  const lowered = text.toLowerCase();
  const [firstStrength] = [...lowered.matchAll(STRENGTH_PATTERN)];
  const words = tokenize(lowered.replace(STRENGTH_PATTERN, " "));
  const strength =
    firstStrength?.[1] === undefined || firstStrength[2] === undefined
      ? undefined
      : { value: Number(firstStrength[1]), unit: firstStrength[2] };
  return {
    text,
    nameTokens: words.filter((word) => FORM_BY_WORD[word] === undefined && !QUERY_OPERATORS.has(word)),
    forms: [...new Set(words.flatMap((word) => FORM_BY_WORD[word] ?? []))],
    ...(strength === undefined ? {} : { strength }),
  };
}

export function formMatches(queryForm: string, productForm: string): boolean {
  const lowered = productForm.toLowerCase();
  return (FORM_MATCHERS[queryForm] ?? [queryForm]).some((word) => lowered.includes(word));
}

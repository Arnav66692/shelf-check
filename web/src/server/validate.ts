import { CONDITION_IDS } from "@engine/flags/profile.ts";
import { EMPTY_PROFILE, type Product, type Profile } from "@/lib/model";

const MAX_ITEMS = 60;
const MAX_ALLERGIES = 30;

const KINDS: ReadonlySet<string> = new Set(["otc", "rx", "supplement", "vial"]);
const PRODUCT_NDC = /^\d{4,5}-\d{3,4}$/;
const DSLD_ID = /^\d{1,8}$/;
const PEPTIDE_ID = /^[a-z0-9-]{2,40}$/;

function optionalMatches(value: unknown, pattern: RegExp): boolean {
  return value === undefined || (typeof value === "string" && pattern.test(value));
}

function isProduct(value: unknown): value is Product {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Product>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length <= 120 &&
    typeof candidate.displayName === "string" &&
    candidate.displayName.length <= 200 &&
    typeof candidate.kind === "string" &&
    KINDS.has(candidate.kind) &&
    optionalMatches(candidate.productNdc, PRODUCT_NDC) &&
    optionalMatches(candidate.dsldId, DSLD_ID) &&
    optionalMatches(candidate.peptideId, PEPTIDE_ID)
  );
}

export function readItems(value: unknown): readonly Product[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || !value.every(isProduct)) return null;
  if (new Set(value.map((item: Product) => item.id)).size !== value.length) return null;
  return value;
}

export function allergiesOverLimit(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const allergies = (value as Record<string, unknown>).allergies;
  return Array.isArray(allergies) && allergies.length > MAX_ALLERGIES;
}

export function readProfile(value: unknown): Profile {
  if (typeof value !== "object" || value === null) return EMPTY_PROFILE;
  const raw = value as Record<string, unknown>;
  const known = new Set<string>(CONDITION_IDS);
  const age = typeof raw.ageYears === "number" && raw.ageYears >= 0 && raw.ageYears <= 130 ? raw.ageYears : undefined;
  return {
    ageYears: age,
    pregnant: raw.pregnant === true,
    breastfeeding: raw.breastfeeding === true,
    drinksThreeOrMoreDaily: raw.drinksThreeOrMoreDaily === true,
    conditions: Array.isArray(raw.conditions)
      ? (raw.conditions.filter((item) => typeof item === "string" && known.has(item)) as Profile["conditions"])
      : [],
    allergies: Array.isArray(raw.allergies)
      ? raw.allergies.filter((item): item is string => typeof item === "string").slice(0, MAX_ALLERGIES)
      : [],
  };
}

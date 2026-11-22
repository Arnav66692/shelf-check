import { CONDITION_IDS } from "@engine/flags/profile.ts";
import { EMPTY_PROFILE, type Product, type Profile } from "@/lib/model";

const MAX_ITEMS = 60;
const MAX_ALLERGIES = 30;

function isProduct(value: unknown): value is Product {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Product>;
  return typeof candidate.id === "string" && typeof candidate.displayName === "string" && typeof candidate.kind === "string";
}

export function readItems(value: unknown): readonly Product[] | null {
  if (!Array.isArray(value) || value.length > MAX_ITEMS || !value.every(isProduct)) return null;
  return value;
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

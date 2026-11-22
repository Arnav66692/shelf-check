import type { ConditionId } from "@engine/flags/profile.ts";
import type { IdentifiedProduct } from "@lookup/types.ts";

export type ProductKind = "otc" | "rx" | "supplement" | "vial";

export type Strength = {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly per?: { readonly value: number; readonly unit: string };
};

export type Product = {
  readonly id: string;
  readonly kind: ProductKind;
  readonly displayName: string;
  readonly maker: string;
  readonly form?: string;
  readonly productNdc?: string;
  readonly dsldId?: string;
  readonly ingredients: readonly Strength[];
  readonly labelImages: readonly string[];
  readonly recordUrl: string;
  readonly matchedBy: "name" | "ndc" | "barcode" | "photo";
  readonly sameAsCount?: number;
  readonly note?: string;
  readonly readerAgreement?: "verified" | "check";
  readonly record?: IdentifiedProduct;
  readonly peptideId?: string;
};

export type Severity = "stop" | "ask" | "info";

export type Flag = {
  readonly id: string;
  readonly type: string;
  readonly severity: Severity;
  readonly title: string;
  readonly explain: string;
  readonly itemIds: readonly string[];
  readonly quotes: readonly FlagQuote[];
  readonly highlight?: readonly string[];
  readonly prescribed?: boolean;
  readonly allPrescribed?: boolean;
};

export type FlagQuote = { readonly excerpt: string; readonly section: string; readonly itemId: string };

export type { ConditionId } from "@engine/flags/profile.ts";

export type Profile = {
  readonly ageYears?: number;
  readonly pregnant: boolean;
  readonly breastfeeding: boolean;
  readonly drinksThreeOrMoreDaily: boolean;
  readonly conditions: readonly ConditionId[];
  readonly allergies: readonly string[];
};

export const EMPTY_PROFILE: Profile = {
  pregnant: false,
  breastfeeding: false,
  drinksThreeOrMoreDaily: false,
  conditions: [],
  allergies: [],
};

export const CONDITION_LABELS: Record<ConditionId, string> = {
  liver_disease: "Liver disease",
  kidney_disease: "Kidney disease",
  high_blood_pressure: "High blood pressure",
  heart_disease: "Heart disease",
  diabetes: "Diabetes",
  glaucoma: "Glaucoma",
  enlarged_prostate: "Trouble urinating from an enlarged prostate",
  thyroid_disease: "Thyroid disease",
  breathing_problem: "Asthma, emphysema or chronic bronchitis",
  stomach_ulcers_or_bleeding: "Stomach ulcers or bleeding problems",
};

export function formatStrength(strength: Strength): string {
  const amount = `${strength.value} ${strength.unit}`;
  return strength.per ? `${amount} per ${strength.per.value === 1 ? "" : `${strength.per.value} `}${strength.per.unit}` : amount;
}

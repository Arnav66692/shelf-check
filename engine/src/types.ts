export const LABEL_SECTION_NAMES = [
  "active_ingredient",
  "purpose",
  "indications_and_usage",
  "warnings",
  "do_not_use",
  "ask_doctor",
  "ask_doctor_or_pharmacist",
  "when_using",
  "stop_use",
  "dosage_and_administration",
  "drug_interactions",
  "boxed_warning",
  "warnings_and_cautions",
  "precautions",
  "contraindications",
  "pregnancy_or_breast_feeding",
  "pregnancy",
  "nursing_mothers",
  "pediatric_use",
  "inactive_ingredient",
  "information_for_patients",
  "spl_medguide",
] as const;

export type LabelSectionName = (typeof LABEL_SECTION_NAMES)[number]
  | "dsld_contains" | "dsld_allergy_precautions" | "dsld_ingredient" | "ndc_active_ingredient" | "normalized_active_ingredient";

export type LabelSections = Readonly<Partial<Record<LabelSectionName, readonly string[]>>>;

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

export interface DrugClass {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly source: string;
}

export interface Ingredient {
  readonly name: string;
  readonly strengthBasis?: string;
  readonly printedName?: string;
  readonly rxcui?: string;
  readonly value: number;
  readonly unit: string;
  readonly per?: Quantity;
  readonly classes?: readonly DrugClass[];
  readonly commonNames?: readonly string[];
}

export type ItemKind = "otc" | "rx" | "supplement" | "vial";

export interface DailyServings {
  readonly unitsPerServing: number;
  readonly servingsPerDay: number;
  readonly unit: string;
}

export interface CabinetItem {
  readonly id: string;
  readonly displayName: string;
  readonly productNdc?: string;
  readonly routes?: readonly string[];
  readonly dsldId?: string;
  readonly kind: ItemKind;
  readonly ingredients: readonly Ingredient[];
  readonly label?: LabelSections;
  readonly labelSource?: {
    readonly name: "DailyMed";
    readonly setId: string;
    readonly version: number;
    readonly labelDate: string;
    readonly url: string;
  };
  readonly dailyServings?: DailyServings;
  readonly verified: boolean;
}

export type FlagType =
  | "duplicate_ingredient"
  | "daily_total"
  | "interaction"
  | "unit_mismatch"
  | "profile"
  | "label_tag"
  | "dose_volume";

export type Severity = "stop" | "ask" | "info";

export interface Quote {
  readonly text: string;
  readonly excerpt: string;
  readonly itemId: string;
  readonly section: LabelSectionName;
}

export type FlagNumbers = Readonly<Record<string, number | null>>;

export type InteractionMatchKind = "ingredient_name" | "common_name" | "class_name" | "class_phrase";

export type ProfileMatchKind = "condition" | "alcohol" | "pregnancy" | "breastfeeding" | "age" | "allergen";

export type LabelTag = "alcohol" | "grapefruit" | "drowsiness" | "sun";

export type MatchKind = InteractionMatchKind | ProfileMatchKind | "label_tag";

export interface OfficialStatement {
  readonly text: string;
  readonly sourceUrl: string;
  readonly pageDate: string;
}

export interface TermMatch {
  readonly text: string;
  readonly term: string;
  readonly kind: MatchKind;
  readonly ingredient?: string;
}

export interface Flag {
  readonly type: FlagType;
  readonly severity: Severity;
  readonly itemIds: readonly string[];
  readonly title: string;
  readonly detail: string;
  readonly explain: string;
  readonly quote?: Quote;
  readonly numbers?: FlagNumbers;
  readonly supportingQuotes?: readonly Quote[];
  readonly match?: TermMatch;
  readonly matchedBecause?: string;
  readonly tag?: LabelTag;
  readonly source?: OfficialStatement;
}

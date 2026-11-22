import type { LookupError } from "./errors.ts";

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
  "contraindications",
  "inactive_ingredient",
] as const;

export type LabelSectionName = (typeof LABEL_SECTION_NAMES)[number];

export type LabelSections = Readonly<Partial<Record<LabelSectionName, readonly string[]>>>;

export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

export interface ProductIngredient {
  readonly rawName: string;
  readonly value: number | null;
  readonly unit: string;
  readonly per?: Quantity;
  readonly strengthText?: string;
}

export type ProductSource = "openfda" | "dsld";

export type ProductKind = "otc" | "rx" | "supplement";

export type MatchedBy = "name" | "ndc" | "barcode";

export interface IdentifiedProduct {
  readonly source: ProductSource;
  readonly kind: ProductKind;
  readonly displayName: string;
  readonly maker: string;
  readonly genericName?: string;
  readonly form?: string;
  readonly route?: string;
  readonly productNdc?: string;
  readonly packageNdc?: string;
  readonly packageDescription?: string;
  readonly splSetId?: string;
  readonly dsldId?: string;
  readonly upc?: string;
  readonly offMarket?: boolean;
  readonly ingredients: readonly ProductIngredient[];
  readonly labelImages: readonly string[];
  readonly recordUrl: string;
  readonly matchedBy: MatchedBy;
  readonly confidenceNote: string;
}

export interface ProductGroup {
  readonly product: IdentifiedProduct;
  readonly makerCount: number;
  readonly members: readonly IdentifiedProduct[];
}

export interface NameSearchOptions {
  readonly limit?: number;
}

export interface NameSearchResult {
  readonly query: string;
  readonly correctedQuery?: string;
  readonly groups: readonly ProductGroup[];
  readonly drugMatchTotal: number;
  readonly sourceErrors: readonly LookupError[];
}

export type NotFoundReason = "no_match" | "unrecognised_code" | "invalid_checksum" | "incomplete_search";

export interface CodeFound {
  readonly status: "found";
  readonly products: readonly IdentifiedProduct[];
  readonly tried: readonly string[];
  readonly sourceErrors: readonly LookupError[];
}

export interface CodeNotFound {
  readonly status: "not_found";
  readonly reason: NotFoundReason;
  readonly message: string;
  readonly tried: readonly string[];
}

export type CodeLookupResult = CodeFound | CodeNotFound;

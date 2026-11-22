import { hasMarketedProduct, NO_APPROVED_USE_NOTICE } from "./peptideLabels.ts";
import { findPeptide, PEPTIDES } from "./peptides.ts";
import type { Peptide, PeptideId } from "./peptides.ts";
import type { CabinetItem, Flag } from "./types.ts";

export const UNKNOWN_STRENGTH_UNIT = "mg";

export interface PeptideCabinetRequest {
  readonly id: string;
  readonly peptideId: PeptideId;
}

export function peptideCabinetItem({ id, peptideId }: PeptideCabinetRequest): CabinetItem {
  const peptide = PEPTIDES[peptideId];
  return {
    id,
    displayName: peptide.name,
    kind: "vial",
    ingredients: [{ name: peptide.name, value: 0, unit: UNKNOWN_STRENGTH_UNIT }],
    verified: false,
  };
}

function statusSentence(peptide: Peptide): string {
  const listedAs = peptide.fdaListedAs ?? peptide.name;
  switch (peptide.fdaStatus) {
    case "approved_product": {
      const brands = peptide.approvedProducts.map((product) => product.brand).join(", ");
      return `The FDA-approved ${peptide.name} product, ${brands}, is discontinued.`;
    }
    case "category_2":
      return `The FDA lists ${listedAs} in Category 2 of its interim policy on bulk drug substances used in compounding.`;
    case "withdrawn_nomination_risk_text_published":
      return `${listedAs} was in Category 2 of the FDA's interim policy on bulk drug substances. The nomination was withdrawn, and the FDA still publishes its risk text.`;
    case "not_compoundable_statement":
      return `The FDA says ${peptide.name} cannot be used in compounding.`;
    case "no_statement_found":
      return `No FDA statement about ${peptide.name} was found in the pages this app checked.`;
  }
}

function titleFor(peptide: Peptide): string {
  return peptide.approvedProducts.length === 0
    ? `${peptide.name} has no FDA-approved product`
    : `${peptide.name} has no FDA-approved product on the market`;
}

function peptideIn(item: CabinetItem): Peptide | undefined {
  if (item.kind !== "vial") return undefined;
  return item.ingredients.map((ingredient) => findPeptide(ingredient.name)).find((peptide) => peptide !== undefined);
}

function flagFor(item: CabinetItem, peptide: Peptide): Flag {
  const status = statusSentence(peptide);
  return {
    type: "profile",
    severity: "ask",
    itemIds: [item.id],
    title: titleFor(peptide),
    detail: `${status} ${NO_APPROVED_USE_NOTICE} Talk to a licensed prescriber or pharmacist before using it.`,
    explain: `${titleFor(peptide)}, so it has no approved use and no approved dose. ${status}`,
    ...(peptide.fdaStatement === undefined ? {} : { source: peptide.fdaStatement }),
  };
}

export function peptideCabinetFlags(items: readonly CabinetItem[]): readonly Flag[] {
  return items.flatMap((item) => {
    const peptide = peptideIn(item);
    return peptide === undefined || hasMarketedProduct(peptide.id) ? [] : [flagFor(item, peptide)];
  });
}

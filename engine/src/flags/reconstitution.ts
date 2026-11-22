import { FDA_UNAPPROVED_GLP1_PAGE_DATE, FDA_UNAPPROVED_GLP1_URL } from "../peptides.ts";
import { EGRIFTA_SV_LABEL, EGRIFTA_WR_LABEL } from "../peptideLabels.ts";
import { formatNumber } from "../text.ts";
import type { Flag, OfficialStatement } from "../types.ts";
import { InvalidDoseInputError, requirePositive } from "./units.ts";

export const MCG_PER_MG = 1000;
const RELATIVE_TOLERANCE = 0.01;
const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const FDA_DOSING_ERRORS_URL =
  "https://www.fda.gov/drugs/human-drug-compounding/fda-alerts-health-care-providers-compounders-and-patients-dosing-errors-associated-compounded";
export const FDA_DOSING_ERRORS_PAGE_DATE = "07/26/2024";

function dosingErrorsStatement(text: string): OfficialStatement {
  return { text, sourceUrl: FDA_DOSING_ERRORS_URL, pageDate: FDA_DOSING_ERRORS_PAGE_DATE };
}

export const U100_SYRINGE_STATEMENT: OfficialStatement = dosingErrorsStatement(
  "In several reports, patients were instructed to use a U-100 (1 milliliter) insulin syringe to draw small doses, such as a 5-unit (0.05 milliliter) dose, from a multiple-dose vial.",
);

export const OVERDOSE_SIZE_STATEMENT: OfficialStatement = dosingErrorsStatement(
  "In these instances, patients administered five to 20 times more than the intended dose of semaglutide.",
);

export const UNIT_CONFUSION_STATEMENT: OfficialStatement = dosingErrorsStatement(
  "Unfamiliarity with withdrawing medication from a vial into a syringe and coupled with confusion between different units of measurement (e.g., milliliters, milligrams and “units”) may have contributed to dosing errors.",
);

export const VIAL_DISCARD_STATEMENT: OfficialStatement = {
  text: "Generally, FDA recommends that vials containing multiple doses of sterile medications be used within 28 days after the first use because there is an increased risk of contamination after 28 days.",
  sourceUrl: FDA_UNAPPROVED_GLP1_URL,
  pageDate: FDA_UNAPPROVED_GLP1_PAGE_DATE,
};

export type VialPresentation = "egrifta-wr" | "egrifta-sv";

const VIAL_RULES = {
  "egrifta-wr": {
    label: EGRIFTA_WR_LABEL,
    vialMg: 11.6,
    diluentMl: 1.3,
    diluent: "supplied-bacteriostatic-water-for-injection",
    concentrationMgPerMl: 8,
    doseMg: 1.28,
    doseStatement: "One dose of EGRIFTA WR is 1.28 mg in 0.16 mL of the reconstituted solution.",
    preparation: "Reconstitute 1 vial of EGRIFTA WR lyophilized powder with 1.3 mL of diluent (8 mg per mL).",
    discard: "Store reconstituted EGRIFTA WR at room temperature at 20°C to 25°C (68°F to 77°F). Discard unused solution of EGRIFTA WR 7 days after mixing. Do not freeze.",
  },
  "egrifta-sv": {
    label: EGRIFTA_SV_LABEL,
    vialMg: 2,
    diluentMl: 0.5,
    diluent: "supplied-sterile-water-for-injection",
    concentrationMgPerMl: 4,
    doseMg: 1.4,
    doseStatement: "The dose of EGRIFTA SV is 1.4 mg (0.35 mL of the reconstituted solution) injected subcutaneously once daily.",
    preparation: "Reconstitute 1 vial of EGRIFTA SV lyophilized powder with 0.5 mL of diluent (2 mg per 0.5 mL).",
    discard: "If not used immediately, discard the reconstituted solution. Do not freeze or refrigerate the reconstituted solution.",
  },
} as const;

function isVialPresentation(value: string | undefined): value is VialPresentation {
  return value !== undefined && Object.hasOwn(VIAL_RULES, value);
}

export type MassUnit = "mg" | "mcg";

export interface ReconstitutionInput {
  readonly presentation?: string;
  readonly diluent?: string;
  readonly vialAmount: number;
  readonly vialUnit: MassUnit;
  readonly diluentMl: number;
}

export interface Reconstitution {
  readonly presentation: VialPresentation;
  readonly source: OfficialStatement;
  readonly vialMg: number;
  readonly diluentMl: number;
  readonly concentrationMgPerMl: number;
  readonly assumption: string;
}

export interface MassDose {
  readonly value: number;
  readonly unit: MassUnit;
}

export interface ReconstitutedDoseInput {
  readonly itemId: string;
  readonly vial: ReconstitutionInput;
  readonly dose: MassDose;
  readonly alsoStated?: MassDose;
}

export interface ReconstitutedDoseCheck {
  readonly reconstitution: Reconstitution;
  readonly dose: { readonly mg: number; readonly mL: number };
  readonly flags: readonly Flag[];
}

export interface VialDiscardDate {
  readonly mixedOn: string;
  readonly timing: "date" | "immediate";
  readonly discardBy: string | null;
  readonly days: number;
  readonly source: OfficialStatement;
  readonly note: string;
}

export class InvalidDateError extends Error {
  constructor(value: string) {
    super(`"${value}" is not a calendar date written as YYYY-MM-DD.`);
    this.name = "InvalidDateError";
  }
}

function toMg(value: number, unit: MassUnit): number {
  if (unit === "mg") return value;
  if (unit === "mcg") return value / MCG_PER_MG;
  throw new InvalidDoseInputError("Specify the printed mass in mg or mcg.");
}

export function reconstitute(input: ReconstitutionInput): Reconstitution | undefined {
  requirePositive(`vialAmount in ${input.vialUnit}`, input.vialAmount);
  requirePositive("diluentMl", input.diluentMl);
  if (!isVialPresentation(input.presentation)) return undefined;
  const rule = VIAL_RULES[input.presentation];
  const vialMg = toMg(input.vialAmount, input.vialUnit);
  if (vialMg !== rule.vialMg || input.diluentMl !== rule.diluentMl || input.diluent !== rule.diluent) return undefined;
  return {
    presentation: input.presentation,
    vialMg,
    diluentMl: input.diluentMl,
    concentrationMgPerMl: rule.concentrationMgPerMl,
    assumption: rule.preparation,
    source: { text: rule.preparation, sourceUrl: rule.label.url, pageDate: rule.label.labelDate },
  };
}

function describeMass(dose: MassDose): string {
  return `${formatNumber(dose.value)} ${dose.unit}`;
}

function inMcg(dose: MassDose): string {
  return dose.unit === "mcg" ? describeMass(dose) : `${describeMass(dose)} (${formatNumber(dose.value * MCG_PER_MG)} mcg)`;
}

function isThousandfold(factor: number): boolean {
  const timesOff = factor > 1 ? factor : 1 / factor;
  return Math.abs(timesOff / MCG_PER_MG - 1) <= RELATIVE_TOLERANCE;
}

function massMismatchFlag(input: ReconstitutedDoseInput, alsoStated: MassDose): readonly Flag[] {
  requirePositive(`alsoStated in ${alsoStated.unit}`, alsoStated.value);
  const doseMg = toMg(input.dose.value, input.dose.unit);
  const statedMg = toMg(alsoStated.value, alsoStated.unit);
  const factor = statedMg / doseMg;
  if (doseMg === statedMg) return [];
  const timesOff = factor > 1 ? factor : 1 / factor;
  const swapped = isThousandfold(factor)
    ? ` A gap of ${formatNumber(MCG_PER_MG)} times is what happens when mg and mcg are swapped.`
    : "";
  return [
    {
      type: "unit_mismatch",
      severity: "stop",
      itemIds: [input.itemId],
      title: `${describeMass(input.dose)} and ${describeMass(alsoStated)} are not the same dose`,
      detail: `The dose was written two ways: ${inMcg(input.dose)} and ${inMcg(alsoStated)}. They differ by ${formatNumber(timesOff)} times.${swapped} Do not inject until a pharmacist or the prescriber confirms which one is right.`,
      explain: "The two ways this dose is written are not the same amount, so do not inject until a pharmacist confirms it.",
      numbers: { doseMg, statedMg, factor },
      source: UNIT_CONFUSION_STATEMENT,
    },
  ];
}

export class UnverifiedDrawError extends InvalidDoseInputError {
  readonly flags: readonly Flag[];

  constructor(message: string, flags: readonly Flag[] = []) {
    super(message);
    this.name = "UnverifiedDrawError";
    this.flags = flags;
  }
}

export function checkReconstitutedDose(input: ReconstitutedDoseInput): ReconstitutedDoseCheck | undefined {
  requirePositive(`dose in ${input.dose.unit}`, input.dose.value);
  const reconstitution = reconstitute(input.vial);
  const doseMg = toMg(input.dose.value, input.dose.unit);
  if (doseMg > toMg(input.vial.vialAmount, input.vial.vialUnit)) {
    throw new UnverifiedDrawError("The entered dose is more than the whole vial holds. Check the vial and prescribed dose with a pharmacist.");
  }
  if (!reconstitution) return undefined;

  const flags = input.alsoStated === undefined ? [] : massMismatchFlag(input, input.alsoStated);
  if (flags.length) throw new UnverifiedDrawError(flags.map((flag) => flag.detail).join(" "), flags);
  const rule = VIAL_RULES[reconstitution.presentation];
  if (doseMg !== rule.doseMg) {
    const detail = "The entered dose does not match the dose on this presentation’s label. Check the prescribed dose with a pharmacist.";
    throw new UnverifiedDrawError(detail, [{
      type: "dose_volume",
      severity: "ask",
      itemIds: [input.itemId],
      title: "The entered dose differs from the labeled dose",
      detail,
      explain: "Ask a pharmacist to verify the dose and how to measure it.",
      source: { text: rule.doseStatement, sourceUrl: rule.label.url, pageDate: rule.label.labelDate },
    }]);
  }
  return { reconstitution, dose: { mg: doseMg, mL: doseMg / rule.concentrationMgPerMl }, flags };

}

function parseIsoDate(value: string): number {
  const [, year, month, day] = ISO_DATE.exec(value) ?? [];
  if (year === undefined || month === undefined || day === undefined) throw new InvalidDateError(value);
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (new Date(time).toISOString().slice(0, 10) !== value) throw new InvalidDateError(value);
  return time;
}

interface DiscardContext {
  readonly event: "mixing" | "first-use";
  readonly storedAsLabeled?: boolean;
}

export function vialDiscardDate(date: string, presentation?: string, context?: DiscardContext): VialDiscardDate | null {
  const mixedOn = parseIsoDate(date);
  if (!isVialPresentation(presentation) || context?.event !== "mixing" || context.storedAsLabeled === false) return null;
  const rule = VIAL_RULES[presentation];
  const source = { text: rule.discard, sourceUrl: rule.label.url, pageDate: rule.label.labelDate };
  if (presentation === "egrifta-sv") {
    return {
      mixedOn: date,
      timing: "immediate",
      discardBy: null,
      days: 0,
      source,
      note: "Discard any unused solution immediately after mixing.",
    };
  }
  if (context.storedAsLabeled !== true) return null;
  const days = 7;
  const discardBy = new Date(mixedOn + days * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
  if (!ISO_DATE.test(discardBy)) return null;
  return {
    mixedOn: date,
    timing: "date",
    discardBy,
    days,
    source,
    note: "Seven days after mixing, under the storage conditions on the Egrifta WR label.",
  };
}

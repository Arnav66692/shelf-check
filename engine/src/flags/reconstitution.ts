import { FDA_UNAPPROVED_GLP1_PAGE_DATE, FDA_UNAPPROVED_GLP1_URL } from "../peptides.ts";
import { formatNumber } from "../text.ts";
import type { Flag, OfficialStatement } from "../types.ts";
import { convertDose, requirePositive, U100_UNITS_PER_ML } from "./units.ts";
import type { DoseEquivalents } from "./units.ts";

export const MCG_PER_MG = 1000;
export const U100_SYRINGE_CAPACITY_ML = 1;
export const SMALLEST_MEASURABLE_U100_UNITS = 1;
export const VIAL_DISCARD_DAYS = 28;
const RELATIVE_TOLERANCE = 0.01;
const SMALLEST_NUMBER_SHOWN = 0.0001;
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

export const NO_ADDED_VOLUME_ASSUMPTION =
  "This figure assumes the powder adds no volume, so the vial holds exactly the liquid that was added. No official source was found for that plain division. Dissolved powder can take up space, and then the real concentration is lower than this figure.";

export const VIAL_DISCARD_NOTE =
  "This date comes from the FDA's general line about vials that hold more than one dose. If the label, the pharmacy or the prescriber gives a shorter time, follow the shorter time.";

export type MassUnit = "mg" | "mcg";

export interface ReconstitutionInput {
  readonly vialAmount: number;
  readonly vialUnit: MassUnit;
  readonly diluentMl: number;
}

export interface Reconstitution {
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
  readonly dose: DoseEquivalents;
  readonly flags: readonly Flag[];
}

export interface VialDiscardDate {
  readonly firstUseDate: string;
  readonly discardBy: string;
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
  return unit === "mg" ? value : value / MCG_PER_MG;
}

export function reconstitute(input: ReconstitutionInput): Reconstitution {
  requirePositive(`vialAmount in ${input.vialUnit}`, input.vialAmount);
  requirePositive("diluentMl", input.diluentMl);
  const vialMg = toMg(input.vialAmount, input.vialUnit);
  return {
    vialMg,
    diluentMl: input.diluentMl,
    concentrationMgPerMl: vialMg / input.diluentMl,
    assumption: NO_ADDED_VOLUME_ASSUMPTION,
  };
}

function describeNumber(value: number): string {
  return value < SMALLEST_NUMBER_SHOWN ? `less than ${formatNumber(SMALLEST_NUMBER_SHOWN)}` : formatNumber(value);
}

function describeMass(dose: MassDose): string {
  return `${formatNumber(dose.value)} ${dose.unit}`;
}

function inMcg(dose: MassDose): string {
  return dose.unit === "mcg" ? describeMass(dose) : `${describeMass(dose)} (${formatNumber(dose.value * MCG_PER_MG)} mcg)`;
}

function describeVolume(dose: DoseEquivalents): string {
  return `${describeNumber(dose.mL)} mL, which is ${describeNumber(dose.u100Units)} units on a U-100 insulin syringe`;
}

function volumeNumbers(reconstitution: Reconstitution, dose: DoseEquivalents): Readonly<Record<string, number>> {
  return {
    vialMg: reconstitution.vialMg,
    diluentMl: reconstitution.diluentMl,
    concentrationMgPerMl: reconstitution.concentrationMgPerMl,
    doseMg: dose.mg,
    doseMl: dose.mL,
    doseU100Units: dose.u100Units,
  };
}

function tooLargeFlag(input: ReconstitutedDoseInput, reconstitution: Reconstitution, dose: DoseEquivalents): readonly Flag[] {
  if (dose.mL <= U100_SYRINGE_CAPACITY_ML) return [];
  const beyondVial = dose.mg > reconstitution.vialMg ? " The dose is also more than the whole vial holds." : "";
  return [
    {
      type: "dose_volume",
      severity: "stop",
      itemIds: [input.itemId],
      title: `${describeMass(input.dose)} does not fit in one 1 mL syringe`,
      detail: `At ${formatNumber(reconstitution.concentrationMgPerMl)} mg per mL, ${describeMass(input.dose)} is ${describeVolume(dose)}. A U-100 insulin syringe holds ${formatNumber(U100_SYRINGE_CAPACITY_ML)} mL, which is ${formatNumber(U100_UNITS_PER_ML)} units.${beyondVial} A number this large often means the vial amount, the liquid amount or the dose was entered in the wrong unit. Do not inject until a pharmacist or the prescriber confirms the amount.`,
      explain: "This dose needs more than one full syringe, which often means a number was entered in the wrong unit.",
      numbers: volumeNumbers(reconstitution, dose),
      source: U100_SYRINGE_STATEMENT,
    },
  ];
}

function tooSmallFlag(input: ReconstitutedDoseInput, reconstitution: Reconstitution, dose: DoseEquivalents): readonly Flag[] {
  if (dose.u100Units >= SMALLEST_MEASURABLE_U100_UNITS) return [];
  return [
    {
      type: "dose_volume",
      severity: "ask",
      itemIds: [input.itemId],
      title: `${describeMass(input.dose)} is too small to measure on a U-100 syringe`,
      detail: `At ${formatNumber(reconstitution.concentrationMgPerMl)} mg per mL, ${describeMass(input.dose)} is ${describeVolume(dose)}. That is less than ${formatNumber(SMALLEST_MEASURABLE_U100_UNITS)} unit, which is too small to measure. Ask a pharmacist or the prescriber how to measure this dose.`,
      explain: "This dose works out to less than 1 unit on the syringe, which is too small to measure.",
      numbers: volumeNumbers(reconstitution, dose),
      source: U100_SYRINGE_STATEMENT,
    },
  ];
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
  if (Math.abs(factor - 1) <= RELATIVE_TOLERANCE) return [];
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

export function checkReconstitutedDose(input: ReconstitutedDoseInput): ReconstitutedDoseCheck {
  const reconstitution = reconstitute(input.vial);
  requirePositive(`dose in ${input.dose.unit}`, input.dose.value);
  const dose = convertDose(reconstitution.concentrationMgPerMl, {
    value: toMg(input.dose.value, input.dose.unit),
    unit: "mg",
  });
  return {
    reconstitution,
    dose,
    flags: [
      ...(input.alsoStated === undefined ? [] : massMismatchFlag(input, input.alsoStated)),
      ...tooLargeFlag(input, reconstitution, dose),
      ...tooSmallFlag(input, reconstitution, dose),
    ],
  };
}

function parseIsoDate(value: string): number {
  const [, year, month, day] = ISO_DATE.exec(value) ?? [];
  if (year === undefined || month === undefined || day === undefined) throw new InvalidDateError(value);
  const time = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (new Date(time).toISOString().slice(0, 10) !== value) throw new InvalidDateError(value);
  return time;
}

export function vialDiscardDate(firstUseDate: string): VialDiscardDate {
  const firstUse = parseIsoDate(firstUseDate);
  const discardBy = new Date(firstUse + VIAL_DISCARD_DAYS * MILLISECONDS_PER_DAY).toISOString().slice(0, 10);
  return { firstUseDate, discardBy, days: VIAL_DISCARD_DAYS, source: VIAL_DISCARD_STATEMENT, note: VIAL_DISCARD_NOTE };
}

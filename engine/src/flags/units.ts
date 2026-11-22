import { formatNumber } from "../text.ts";
import type { Flag } from "../types.ts";

export const U100_UNITS_PER_ML = 100;
const RELATIVE_TOLERANCE = 0.01;

export type DoseUnit = "mg" | "mL" | "units";
export type SyringeType = "u100_insulin" | "mL";

export interface StatedDose {
  readonly value: number;
  readonly unit: DoseUnit;
}

export interface DoseEquivalents {
  readonly mg: number;
  readonly mL: number;
  readonly u100Units: number;
}

export interface InjectionCheckInput {
  readonly itemId: string;
  readonly concentrationMgPerMl: number;
  readonly prescribed: StatedDose;
  readonly alsoStated?: StatedDose;
  readonly syringe: SyringeType;
}

export interface InjectionCheck {
  readonly dose: DoseEquivalents;
  readonly drawTo: StatedDose;
  readonly flags: readonly Flag[];
}

export class InvalidDoseInputError extends Error {
  constructor(field: string, value: number) {
    super(`${field} must be a positive finite number, got ${value}.`);
    this.name = "InvalidDoseInputError";
  }
}

export function requirePositive(field: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new InvalidDoseInputError(field, value);
}

export function convertDose(concentrationMgPerMl: number, dose: StatedDose): DoseEquivalents {
  requirePositive("concentrationMgPerMl", concentrationMgPerMl);
  requirePositive(`dose in ${dose.unit}`, dose.value);
  const mL =
    dose.unit === "mL"
      ? dose.value
      : dose.unit === "units"
        ? dose.value / U100_UNITS_PER_ML
        : dose.value / concentrationMgPerMl;
  return { mg: mL * concentrationMgPerMl, mL, u100Units: mL * U100_UNITS_PER_ML };
}

function describeDose(dose: StatedDose): string {
  return `${formatNumber(dose.value)} ${dose.unit}`;
}

function describeEquivalents(dose: DoseEquivalents): string {
  return `${formatNumber(dose.mg)} mg, ${formatNumber(dose.mL)} mL, ${formatNumber(dose.u100Units)} units on a U-100 syringe`;
}

function pairMismatchFlag(input: InjectionCheckInput, prescribed: DoseEquivalents, alsoStated: StatedDose): readonly Flag[] {
  const stated = convertDose(input.concentrationMgPerMl, alsoStated);
  const factor = stated.mg / prescribed.mg;
  if (Math.abs(factor - 1) <= RELATIVE_TOLERANCE) return [];
  const timesOff = factor > 1 ? factor : 1 / factor;
  const direction = factor > 1 ? "more" : "less";
  return [
    {
      type: "unit_mismatch",
      severity: "stop",
      itemIds: [input.itemId],
      title: `${describeDose(input.prescribed)} and ${describeDose(alsoStated)} are not the same dose`,
      detail: `At ${formatNumber(input.concentrationMgPerMl)} mg per mL, ${describeDose(input.prescribed)} is ${describeEquivalents(prescribed)}. ${describeDose(alsoStated)} is ${describeEquivalents(stated)}. That is ${formatNumber(timesOff)} times ${direction} than the prescribed dose. Do not inject until a pharmacist or the prescriber confirms the amount.`,
      explain: "The two ways this dose is written are not the same amount, so do not inject until a pharmacist confirms it.",
      numbers: {
        concentrationMgPerMl: input.concentrationMgPerMl,
        prescribedMg: prescribed.mg,
        prescribedMl: prescribed.mL,
        prescribedU100Units: prescribed.u100Units,
        statedMg: stated.mg,
        statedMl: stated.mL,
        statedU100Units: stated.u100Units,
        factor,
      },
    },
  ];
}

function syringeMismatchFlag(input: InjectionCheckInput, prescribed: DoseEquivalents): readonly Flag[] {
  if (input.syringe !== "mL" || input.prescribed.unit !== "units") return [];
  return [
    {
      type: "unit_mismatch",
      severity: "ask",
      itemIds: [input.itemId],
      title: "Dose is written in syringe units but the syringe is marked in mL",
      detail: `${describeDose(input.prescribed)} on a U-100 insulin syringe is ${formatNumber(prescribed.mL)} mL. A mL syringe has no unit marks. Ask a pharmacist to confirm the mark to draw to.`,
      explain: "The dose is written in insulin syringe units but this syringe is marked in mL, so ask a pharmacist which mark to draw to.",
      numbers: {
        concentrationMgPerMl: input.concentrationMgPerMl,
        prescribedMg: prescribed.mg,
        prescribedMl: prescribed.mL,
        prescribedU100Units: prescribed.u100Units,
      },
    },
  ];
}

export function checkInjectionDose(input: InjectionCheckInput): InjectionCheck {
  const dose = convertDose(input.concentrationMgPerMl, input.prescribed);
  const drawTo: StatedDose =
    input.syringe === "u100_insulin" ? { value: dose.u100Units, unit: "units" } : { value: dose.mL, unit: "mL" };
  return {
    dose,
    drawTo,
    flags: [
      ...(input.alsoStated === undefined ? [] : pairMismatchFlag(input, dose, input.alsoStated)),
      ...syringeMismatchFlag(input, dose),
    ],
  };
}

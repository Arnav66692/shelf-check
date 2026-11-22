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

interface SyringeInput {
  readonly itemId: string;
  readonly syringe: SyringeType;
  /** Defaults describe the 1 mL syringe with one-unit graduations shown by the dose screen. */
  readonly syringeCapacityMl?: number;
  readonly syringeGraduationMl?: number;
}

/** For a vial labeled in mass per volume, "units" refers only to U-100 syringe marks. */
export interface InjectionCheckInput extends SyringeInput {
  readonly medication?: "non_insulin";
  readonly concentrationMgPerMl: number;
  readonly prescribed: StatedDose;
  readonly alsoStated?: StatedDose | undefined;
}

export interface InsulinInjectionInput extends SyringeInput {
  readonly medication: "insulin";
  readonly insulinUnitsPerMl?: number | null;
  readonly prescribed: { readonly value: number; readonly unit: "units" };
  readonly alsoStated?: never;
  readonly concentrationMgPerMl?: never;
}

export interface InjectionCheck {
  readonly dose: DoseEquivalents;
  readonly drawTo: StatedDose | null;
  readonly flags: readonly Flag[];
}

export interface InsulinInjectionCheck {
  readonly dose: { readonly insulinUnits: number; readonly mL: number } | null;
  readonly drawTo: StatedDose | null;
  readonly flags: readonly Flag[];
}

export class InvalidDoseInputError extends Error {
  constructor(field: string, value?: number) {
    super(value === undefined ? field : `${field} must be a positive finite number, got ${value}.`);
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

function drawVolumeFlag(input: SyringeInput, mL: number): Flag | undefined {
  const capacity = input.syringeCapacityMl ?? 1;
  const graduation = input.syringeGraduationMl ?? 0.01;
  requirePositive("syringeCapacityMl", capacity);
  requirePositive("syringeGraduationMl", graduation);
  if (graduation > capacity) throw new InvalidDoseInputError("A graduation cannot exceed syringe capacity.");
  const steps = mL / graduation;
  // Permit only floating-point roundoff when comparing to a printed graduation.
  const atMark = Math.abs(steps - Math.round(steps)) <= 4 * Number.EPSILON * steps;
  let title: string;
  let detail: string;
  if (mL - capacity > 4 * Number.EPSILON * capacity) {
    title = "The dose exceeds the syringe capacity";
    detail = `This dose exceeds the syringe capacity of ${capacity} mL.`;
  } else if (steps < 1 && !atMark) {
    title = "The dose is too small to measure";
    detail = `This dose is below the first syringe mark of ${graduation} mL.`;
  } else if (!atMark || steps === 0) {
    title = "The dose does not fall on a syringe mark";
    detail = `The syringe is marked in steps of ${graduation} mL. This dose does not line up with a mark.`;
  } else {
    return undefined;
  }
  return {
    type: "dose_volume", severity: "stop", itemIds: [input.itemId], title,
    detail: `${detail} Ask a pharmacist how to measure the prescribed dose before injecting.`,
    explain: detail,
    numbers: { prescribedMl: mL, syringeCapacityMl: capacity, syringeGraduationMl: graduation },
  };
}

function checkInsulinDose(input: InsulinInjectionInput): InsulinInjectionCheck {
  requirePositive("prescribed insulin units", input.prescribed.value);
  if (input.insulinUnitsPerMl !== U100_UNITS_PER_ML || input.syringe !== "u100_insulin" || input.prescribed.unit !== "units") {
    const detail = "A U-100 syringe mark can represent prescribed insulin units only for confirmed U-100 insulin. Ask the pharmacist to confirm the strength and the delivery device.";
    return {
      dose: null, drawTo: null,
      flags: [{ type: "unit_mismatch", severity: "stop", itemIds: [input.itemId], title: "Insulin strength or syringe does not match", detail, explain: detail }],
    };
  }
  const insulinUnits = input.prescribed.value;
  const mL = insulinUnits / U100_UNITS_PER_ML;
  const flag = drawVolumeFlag(input, mL);
  return {
    dose: { insulinUnits, mL },
    drawTo: flag ? null : { value: insulinUnits, unit: "units" },
    flags: flag ? [flag] : [],
  };
}

export function checkInjectionDose(input: InjectionCheckInput): InjectionCheck;
export function checkInjectionDose(input: InsulinInjectionInput): InsulinInjectionCheck;
export function checkInjectionDose(input: InjectionCheckInput | InsulinInjectionInput): InjectionCheck | InsulinInjectionCheck {
  if (input.medication === "insulin") return checkInsulinDose(input);
  const dose = convertDose(input.concentrationMgPerMl, input.prescribed);
  requirePositive("converted volume", dose.mL);
  requirePositive("converted mass", dose.mg);
  const volumeFlag = drawVolumeFlag(input, dose.mL);
  const flags = [
    ...(input.alsoStated === undefined ? [] : pairMismatchFlag(input, dose, input.alsoStated)),
    ...syringeMismatchFlag(input, dose),
    ...(volumeFlag ? [volumeFlag] : []),
  ];
  const drawTo: StatedDose =
    input.syringe === "u100_insulin" ? { value: dose.u100Units, unit: "units" } : { value: dose.mL, unit: "mL" };
  return { dose, drawTo: flags.some((flag) => flag.severity === "stop") ? null : drawTo, flags };
}

import { StrengthParseError } from "./errors.ts";
import type { Quantity } from "./types.ts";

export const PER_EACH_UNIT = "each";

export interface DeclaredAmount extends Quantity {
  readonly per?: Quantity;
}

export interface Strength extends DeclaredAmount {
  readonly per: Quantity;
}

const STRENGTH_PATTERN = /^\s*(\d*\.?\d+(?:e[+-]?\d+)?)\s*([^\s/]+)\s*(?:\/\s*(\d*\.?\d+)?\s*([^\s/]*))?\s*$/i;

const MILLIGRAMS_PER_UNIT: Readonly<Record<string, number>> = {
  kg: 1_000_000,
  g: 1000,
  mg: 1,
  mcg: 0.001,
  ug: 0.001,
  "µg": 0.001,
  "μg": 0.001,
};

export function parseStrength(text: string): Strength {
  const [, rawValue, unit, rawPerValue, rawPerUnit] = STRENGTH_PATTERN.exec(text) ?? [];
  if (rawValue === undefined || unit === undefined) throw new StrengthParseError(text);
  const value = Number(rawValue);
  const perValue = rawPerValue === undefined ? 1 : Number(rawPerValue);
  if (!Number.isFinite(value) || !Number.isFinite(perValue) || perValue <= 0) throw new StrengthParseError(text);
  const perUnit = rawPerUnit === undefined || rawPerUnit === "" ? PER_EACH_UNIT : rawPerUnit;
  return { value, unit, per: { value: perValue, unit: perUnit } };
}

export function toMilligrams(quantity: Quantity): number | null {
  const factor = MILLIGRAMS_PER_UNIT[quantity.unit.toLowerCase()];
  return factor === undefined ? null : quantity.value * factor;
}

const MILLILITERS_PER_UNIT: Readonly<Record<string, number>> = {
  l: 1000, dl: 100, ml: 1, ul: 0.001, "µl": 0.001, "μl": 0.001,
};
const SINGLE_UNIT = { value: 1, unit: PER_EACH_UNIT };

function commonUnits(quantity: Quantity): Quantity {
  const unit = quantity.unit.toLowerCase();
  const mg = toMilligrams(quantity);
  if (mg !== null) return { value: mg, unit: "mg" };
  const ml = MILLILITERS_PER_UNIT[unit];
  if (ml !== undefined) return { value: quantity.value * ml, unit: "ml" };
  if (/^(?:tablet|caplet|capsule|softgel|gummy|pill)(?:s|\(s\))?$/.test(unit)) {
    return { value: quantity.value, unit: PER_EACH_UNIT };
  }
  return { value: quantity.value, unit };
}

export function sameAmount(left: DeclaredAmount, right: DeclaredAmount): boolean {
  const leftAmount = commonUnits(left);
  const rightAmount = commonUnits(right);
  const leftPer = commonUnits(left.per ?? SINGLE_UNIT);
  const rightPer = commonUnits(right.per ?? SINGLE_UNIT);
  if (leftAmount.unit !== rightAmount.unit || leftPer.unit !== rightPer.unit || leftPer.value <= 0 || rightPer.value <= 0) {
    return false;
  }
  const leftRate = leftAmount.value / leftPer.value;
  const rightRate = rightAmount.value / rightPer.value;
  if (!Number.isFinite(leftRate) || !Number.isFinite(rightRate)) return false;
  return Math.abs(leftRate - rightRate) <= Math.max(Math.abs(leftRate), Math.abs(rightRate)) * 1e-9;
}

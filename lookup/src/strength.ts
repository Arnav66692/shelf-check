import { StrengthParseError } from "./errors.ts";
import type { Quantity } from "./types.ts";

export const PER_EACH_UNIT = "each";

export interface Strength {
  readonly value: number;
  readonly unit: string;
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

export function sameAmount(left: Quantity, right: Quantity): boolean {
  const leftMg = toMilligrams(left);
  const rightMg = toMilligrams(right);
  if (leftMg !== null && rightMg !== null) return Math.abs(leftMg - rightMg) <= Math.abs(leftMg) * 1e-9;
  return left.value === right.value && left.unit.toLowerCase() === right.unit.toLowerCase();
}

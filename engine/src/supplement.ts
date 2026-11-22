import { resolveIdentity } from "./cabinet.ts";
import type { IdentitySources, ResolvedIdentity } from "./cabinet.ts";
import type { DsldClient, DsldIngredientRow, DsldLabel, DsldQuantity } from "./sources/dsld.ts";
import { PER_EACH_UNIT } from "./sources/openfda.ts";
import { isNutritionFact } from "./supplementNames.ts";
import type { CabinetItem, DailyServings, Ingredient, LabelSectionName, LabelSections } from "./types.ts";

// DSLD writes "NP" as the unit when the label names an ingredient without giving its amount.
export const DSLD_NO_AMOUNT_UNIT = "NP";

const ROW_CATEGORIES_THAT_ARE_NOT_INGREDIENTS: readonly string[] = ["other", "blend"];
const DIRECTIONS_STATEMENT = /^suggested\/recommended\/usage\/directions/i;
const PRECAUTION_STATEMENT = /^precautions/i;
const MILLIGRAMS = new Map([["g", 1000], ["mg", 1], ["mcg", 0.001]]);

export class SupplementNotFoundError extends Error {
  constructor(dsldId: string) {
    super(`The Dietary Supplement Label Database has no label with id "${dsldId}".`);
    this.name = "SupplementNotFoundError";
  }
}

export interface SupplementSources extends IdentitySources {
  readonly dsld: DsldClient;
}

export interface SupplementItemRequest {
  readonly id: string;
  readonly dsldId: string;
  readonly displayName?: string;
}

interface ResolvedRow {
  readonly row: DsldIngredientRow;
  readonly identity: ResolvedIdentity;
}

function withNestedRows(rows: readonly DsldIngredientRow[]): readonly DsldIngredientRow[] {
  return rows.flatMap((row) => [row, ...withNestedRows(row.nestedRows)]);
}

function isIngredientRow(row: DsldIngredientRow): boolean {
  return !ROW_CATEGORIES_THAT_ARE_NOT_INGREDIENTS.includes(row.category?.toLowerCase() ?? "") &&
    !printedNames(row).some(isNutritionFact);
}

function printedNames(row: DsldIngredientRow): readonly string[] {
  return row.ingredientGroup === undefined ? [row.name] : [row.name, row.ingredientGroup];
}

function groupOf(row: DsldIngredientRow): string {
  return (row.ingredientGroup ?? row.name).toLowerCase();
}

// A row nested under a row of the same ingredient group is a part of it (the plant part of an extract, the
// "other omega-3" inside the omega-3 total), so it is not a separate ingredient and is not counted again.
async function resolveRows(
  rows: readonly DsldIngredientRow[],
  ancestorGroups: readonly string[],
  sources: IdentitySources,
): Promise<readonly ResolvedRow[]> {
  const resolved = await Promise.all(
    rows.map(async (row): Promise<readonly ResolvedRow[]> => {
      if (!isIngredientRow(row)) return resolveRows(row.nestedRows, ancestorGroups, sources);
      if (ancestorGroups.includes(groupOf(row))) return [];
      const identity = await resolveIdentity(printedNames(row), groupOf(row), sources);
      const nested = await resolveRows(row.nestedRows, [...ancestorGroups, groupOf(row)], sources);
      return [{ row, identity }, ...nested];
    }),
  );
  return resolved.flat();
}

function unique(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);
}

function massUnit(unit: string): string {
  return unit.trim().toLowerCase()
    .replace(/^(?:[µμu]g|micrograms?)$/, "mcg")
    .replace(/^milligrams?$/, "mg")
    .replace(/^grams?$/, "g");
}

function servingUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/^(capsule|softgel|tablet|packet|drop|scoop)(?:\(s\)|s)$/, "$1");
}

type ServingAmount = DsldQuantity & { readonly servingSizeQuantity: number; readonly servingSizeUnit: string };

function exactServingAmount(row: DsldIngredientRow): ServingAmount | undefined {
  const [amount] = row.quantity;
  if (row.quantity.length !== 1 || !amount || amount.unit === DSLD_NO_AMOUNT_UNIT) return undefined;
  const { quantity, operator, servingSizeQuantity, servingSizeUnit } = amount;
  if (operator !== undefined && operator !== "=") return undefined;
  if (!servingSizeUnit || servingSizeQuantity === undefined || !Number.isFinite(servingSizeQuantity)) return undefined;
  if (servingSizeQuantity <= 0 || !Number.isFinite(quantity) || quantity <= 0) return undefined;
  return { ...amount, servingSizeQuantity, servingSizeUnit };
}

function combinedAmount(rows: readonly ResolvedRow[], servings: DailyServings | undefined): DsldQuantity | undefined {
  const amounts = rows.map(({ row }) => exactServingAmount(row));
  const [first] = amounts;
  if (!first) return undefined;
  const unit = massUnit(first.unit);
  const firstScale = MILLIGRAMS.get(unit);
  const perUnit = servingUnit(first.servingSizeUnit);
  let quantity = 0;
  for (const amount of amounts) {
    if (!amount || servingUnit(amount.servingSizeUnit) !== perUnit) return undefined;
    const rowUnit = massUnit(amount.unit);
    let value = amount.quantity;
    if (rowUnit !== unit) {
      const rowScale = MILLIGRAMS.get(rowUnit);
      if (firstScale === undefined || rowScale === undefined) return undefined;
      value = value * rowScale / firstScale;
    }
    quantity += value * (first.servingSizeQuantity / amount.servingSizeQuantity);
  }
  if (!Number.isFinite(quantity)) return undefined;
  const servingSizeUnit = servings && servingUnit(servings.unit) === perUnit ? servings.unit : first.servingSizeUnit;
  return { ...first, unit: firstScale === undefined ? first.unit : unit, servingSizeUnit, quantity };
}

function toIngredient(name: string, sameIngredient: readonly ResolvedRow[], servings: DailyServings | undefined): Ingredient {
  const amount = combinedAmount(sameIngredient, servings);
  const printed = unique(sameIngredient.map(({ row }) => row.name));
  const identity = sameIngredient[0]?.identity;
  const commonNames = unique(sameIngredient.flatMap((resolved) => printedNames(resolved.row))).filter(
    (printed) => printed.toLowerCase() !== name,
  );
  return {
    name,
    ...(printed.length === 1 && printed[0] !== undefined ? { strengthBasis: printed[0], printedName: printed[0] } : {}),
    value: amount?.quantity ?? 0,
    unit: amount?.unit ?? DSLD_NO_AMOUNT_UNIT,
    per: { value: amount?.servingSizeQuantity ?? 1, unit: amount?.servingSizeUnit ?? PER_EACH_UNIT },
    classes: identity?.classes ?? [],
    ...(commonNames.length === 0 ? {} : { commonNames }),
    ...(identity?.rxcui === undefined ? {} : { rxcui: identity.rxcui }),
  };
}

function toIngredients(resolvedRows: readonly ResolvedRow[], servings: DailyServings | undefined): readonly Ingredient[] {
  const names = unique(resolvedRows.map((resolved) => resolved.identity.name));
  return names.map((name) =>
    toIngredient(
      name,
      resolvedRows.filter((resolved) => resolved.identity.name === name),
      servings,
    ),
  );
}

export function dailyServingsOf(label: DsldLabel): DailyServings | undefined {
  if (label.servingSizes.length !== 1) return undefined;
  const [serving] = label.servingSizes;
  const unitsPerServing = serving?.maxQuantity;
  const servingsPerDay = serving?.maxDailyServings;
  if (serving?.unit === undefined || unitsPerServing === undefined || servingsPerDay === undefined) return undefined;
  if (unitsPerServing <= 0 || servingsPerDay <= 0) return undefined;
  return { unitsPerServing, servingsPerDay, unit: serving.unit };
}

function statementsMatching(label: DsldLabel, type: RegExp): readonly string[] {
  return label.statements.filter((statement) => type.test(statement.type)).map((statement) => statement.notes);
}

// Every paragraph is a string taken as is from the DSLD record, so quotes stay word for word.
export function supplementLabelSections(label: DsldLabel): LabelSections {
  const sections: readonly (readonly [LabelSectionName, readonly string[]])[] = [
    ["active_ingredient", withNestedRows(label.ingredientRows).filter(isIngredientRow).map((row) => row.notes ?? row.name)],
    ["inactive_ingredient", label.otherIngredients.flatMap((other) => [other.name, ...other.forms])],
    ["dosage_and_administration", statementsMatching(label, DIRECTIONS_STATEMENT)],
    ["warnings", statementsMatching(label, PRECAUTION_STATEMENT)],
    ["dsld_contains", statementsMatching(label, /^formula re: contains$/i)],
    ["dsld_allergy_precautions", statementsMatching(label, /^precautions re: allergies$/i)],
  ];
  return Object.fromEntries(sections.filter(([, paragraphs]) => paragraphs.length > 0));
}

export async function supplementItemFromLabel(
  request: SupplementItemRequest,
  label: DsldLabel,
  sources: IdentitySources,
): Promise<CabinetItem> {
  const resolvedRows = await resolveRows(label.ingredientRows, [], sources);
  const dailyServings = dailyServingsOf(label);
  return {
    id: request.id,
    displayName: request.displayName ?? [label.brandName, label.fullName].filter((part) => part !== undefined).join(" "),
    dsldId: label.id,
    kind: "supplement",
    ingredients: toIngredients(resolvedRows, dailyServings),
    label: supplementLabelSections(label),
    verified: false,
    ...(dailyServings === undefined ? {} : { dailyServings }),
  };
}

export async function buildSupplementItem(request: SupplementItemRequest, sources: SupplementSources): Promise<CabinetItem> {
  const label = await sources.dsld.getLabel(request.dsldId);
  if (label === null) throw new SupplementNotFoundError(request.dsldId);
  return supplementItemFromLabel(request, label, sources);
}

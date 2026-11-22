import { resolveIdentity } from "./cabinet.ts";
import type { IdentitySources, ResolvedIdentity } from "./cabinet.ts";
import type { DsldClient, DsldIngredientRow, DsldLabel, DsldQuantity } from "./sources/dsld.ts";
import { PER_EACH_UNIT } from "./sources/openfda.ts";
import type { CabinetItem, DailyServings, Ingredient, LabelSectionName, LabelSections } from "./types.ts";

// DSLD writes "NP" as the unit when the label names an ingredient without giving its amount.
export const DSLD_NO_AMOUNT_UNIT = "NP";

const ROW_CATEGORIES_THAT_ARE_NOT_INGREDIENTS: readonly string[] = ["other", "blend"];
const DIRECTIONS_STATEMENT = /^suggested\/recommended\/usage\/directions/i;
const PRECAUTION_STATEMENT = /^precautions/i;

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
  return !ROW_CATEGORIES_THAT_ARE_NOT_INGREDIENTS.includes(row.category?.toLowerCase() ?? "");
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

function statedAmount(row: DsldIngredientRow): DsldQuantity | undefined {
  return row.quantity.find((quantity) => quantity.unit !== DSLD_NO_AMOUNT_UNIT);
}

function unique(values: readonly string[]): readonly string[] {
  return values.filter((value, index) => values.findIndex((other) => other.toLowerCase() === value.toLowerCase()) === index);
}

function isSameBasis(left: DsldQuantity, right: DsldQuantity): boolean {
  return (
    left.unit === right.unit &&
    left.servingSizeQuantity === right.servingSizeQuantity &&
    left.servingSizeUnit === right.servingSizeUnit
  );
}

// Separate rows for one ingredient (an extract and the plain herb) add up when they are stated the same way.
function combinedAmount(sameIngredient: readonly ResolvedRow[]): DsldQuantity | undefined {
  const amounts = sameIngredient.flatMap((resolved) => statedAmount(resolved.row) ?? []);
  const [first] = amounts;
  if (first === undefined) return sameIngredient[0]?.row.quantity[0];
  if (!amounts.every((amount) => isSameBasis(amount, first))) return first;
  return { ...first, quantity: amounts.reduce((sum, amount) => sum + amount.quantity, 0) };
}

function toIngredient(name: string, sameIngredient: readonly ResolvedRow[]): Ingredient {
  const amount = combinedAmount(sameIngredient);
  const identity = sameIngredient[0]?.identity;
  const commonNames = unique(sameIngredient.flatMap((resolved) => printedNames(resolved.row))).filter(
    (printed) => printed.toLowerCase() !== name,
  );
  return {
    name,
    value: amount?.quantity ?? 0,
    unit: amount?.unit ?? DSLD_NO_AMOUNT_UNIT,
    per: { value: amount?.servingSizeQuantity ?? 1, unit: amount?.servingSizeUnit ?? PER_EACH_UNIT },
    classes: identity?.classes ?? [],
    ...(commonNames.length === 0 ? {} : { commonNames }),
    ...(identity?.rxcui === undefined ? {} : { rxcui: identity.rxcui }),
  };
}

function toIngredients(resolvedRows: readonly ResolvedRow[]): readonly Ingredient[] {
  const names = unique(resolvedRows.map((resolved) => resolved.identity.name));
  return names.map((name) =>
    toIngredient(
      name,
      resolvedRows.filter((resolved) => resolved.identity.name === name),
    ),
  );
}

export function dailyServingsOf(label: DsldLabel): DailyServings | undefined {
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
    ingredients: toIngredients(resolvedRows),
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

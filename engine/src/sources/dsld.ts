import { createCachedJsonGetter, isRecord, recordArrayField, ResponseShapeError, stringField } from "./http.ts";
import type { FetchFn } from "./http.ts";

const DSLD_BASE_URL = "https://api.ods.od.nih.gov/dsld/v9";
const STATUS_OK = 200;
const STATUS_NO_MATCH = 404;

export interface DsldQuantity {
  readonly quantity: number;
  readonly unit: string;
  readonly servingSizeQuantity?: number;
  readonly servingSizeUnit?: string;
}

export interface DsldIngredientRow {
  readonly name: string;
  readonly ingredientGroup?: string;
  readonly category?: string;
  readonly notes?: string;
  readonly quantity: readonly DsldQuantity[];
  readonly forms: readonly string[];
  readonly nestedRows: readonly DsldIngredientRow[];
}

export interface DsldOtherIngredient {
  readonly name: string;
  readonly forms: readonly string[];
}

export interface DsldServingSize {
  readonly unit?: string;
  readonly minQuantity?: number;
  readonly maxQuantity?: number;
  readonly minDailyServings?: number;
  readonly maxDailyServings?: number;
}

export interface DsldStatement {
  readonly type: string;
  readonly notes: string;
}

export interface DsldLabel {
  readonly id: string;
  readonly fullName: string;
  readonly brandName?: string;
  readonly upcSku?: string;
  readonly servingSizes: readonly DsldServingSize[];
  readonly ingredientRows: readonly DsldIngredientRow[];
  readonly otherIngredients: readonly DsldOtherIngredient[];
  readonly statements: readonly DsldStatement[];
}

export interface DsldSearchHit {
  readonly id: string;
  readonly fullName: string;
  readonly brandName?: string;
}

export interface DsldClient {
  getLabel(id: string): Promise<DsldLabel | null>;
  search(query: string, size: number): Promise<readonly DsldSearchHit[]>;
}

export interface DsldClientOptions {
  readonly fetch?: FetchFn;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function textField(record: Record<string, unknown>, key: string): string | undefined {
  const value = stringField(record, key)?.trim();
  return value === undefined || value === "" ? undefined : value;
}

function optional<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function formNames(raw: Record<string, unknown>): readonly string[] {
  return recordArrayField(raw, "forms").flatMap((form) => textField(form, "name") ?? []);
}

function toQuantity(raw: Record<string, unknown>): readonly DsldQuantity[] {
  const quantity = numberField(raw, "quantity");
  const unit = textField(raw, "unit");
  if (quantity === undefined || unit === undefined) return [];
  return [
    {
      quantity,
      unit,
      ...optional("servingSizeQuantity", numberField(raw, "servingSizeQuantity")),
      ...optional("servingSizeUnit", textField(raw, "servingSizeUnit")),
    },
  ];
}

function toIngredientRow(raw: Record<string, unknown>): DsldIngredientRow {
  const name = textField(raw, "name");
  if (name === undefined) throw new ResponseShapeError("DSLD label", "an ingredient row has no name");
  return {
    name,
    quantity: recordArrayField(raw, "quantity").flatMap(toQuantity),
    forms: formNames(raw),
    nestedRows: recordArrayField(raw, "nestedRows").map(toIngredientRow),
    ...optional("ingredientGroup", textField(raw, "ingredientGroup")),
    ...optional("category", textField(raw, "category")),
    ...optional("notes", textField(raw, "notes")),
  };
}

function toServingSize(raw: Record<string, unknown>): DsldServingSize {
  return {
    ...optional("unit", textField(raw, "unit")),
    ...optional("minQuantity", numberField(raw, "minQuantity")),
    ...optional("maxQuantity", numberField(raw, "maxQuantity")),
    ...optional("minDailyServings", numberField(raw, "minDailyServings")),
    ...optional("maxDailyServings", numberField(raw, "maxDailyServings")),
  };
}

function toStatement(raw: Record<string, unknown>): readonly DsldStatement[] {
  const type = textField(raw, "type");
  const notes = textField(raw, "notes");
  return type === undefined || notes === undefined ? [] : [{ type, notes }];
}

function toOtherIngredient(raw: Record<string, unknown>): readonly DsldOtherIngredient[] {
  const name = textField(raw, "name");
  return name === undefined ? [] : [{ name, forms: formNames(raw) }];
}

function idOf(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "number" || typeof value === "string" ? String(value) : undefined;
}

function toLabel(body: unknown): DsldLabel {
  if (!isRecord(body)) throw new ResponseShapeError("DSLD label", "body is not an object");
  const id = idOf(body, "id");
  const fullName = textField(body, "fullName");
  if (id === undefined || fullName === undefined) throw new ResponseShapeError("DSLD label", "missing id or fullName");
  const other = body["otheringredients"];
  return {
    id,
    fullName,
    servingSizes: recordArrayField(body, "servingSizes").map(toServingSize),
    ingredientRows: recordArrayField(body, "ingredientRows").map(toIngredientRow),
    otherIngredients: isRecord(other) ? recordArrayField(other, "ingredients").flatMap(toOtherIngredient) : [],
    statements: recordArrayField(body, "statements").flatMap(toStatement),
    ...optional("brandName", textField(body, "brandName")),
    ...optional("upcSku", textField(body, "upcSku")),
  };
}

function toSearchHit(raw: Record<string, unknown>): readonly DsldSearchHit[] {
  const id = idOf(raw, "_id");
  const source = raw["_source"];
  const fullName = isRecord(source) ? textField(source, "fullName") : undefined;
  if (id === undefined || fullName === undefined || !isRecord(source)) return [];
  return [{ id, fullName, ...optional("brandName", textField(source, "brandName")) }];
}

// DSLD answers an unknown label id with status 200 and an empty list.
function isEmptyAnswer(body: unknown): boolean {
  return Array.isArray(body) && body.length === 0;
}

export function dsldLabelUrl(id: string): string {
  return `${DSLD_BASE_URL}/label/${encodeURIComponent(id)}`;
}

export function dsldSearchUrl(query: string, size: number): string {
  return `${DSLD_BASE_URL}/search-filter?q=${encodeURIComponent(query)}&size=${size}`;
}

export function createDsldClient(options: DsldClientOptions = {}): DsldClient {
  const getJson = createCachedJsonGetter({
    fetch: options.fetch ?? fetch,
    acceptedStatuses: [STATUS_OK, STATUS_NO_MATCH],
  });

  return {
    async getLabel(id) {
      const { status, body } = await getJson(dsldLabelUrl(id));
      return status === STATUS_NO_MATCH || isEmptyAnswer(body) ? null : toLabel(body);
    },
    async search(query, size) {
      const { status, body } = await getJson(dsldSearchUrl(query, size));
      if (status === STATUS_NO_MATCH) return [];
      if (!isRecord(body) || !Array.isArray(body["hits"])) throw new ResponseShapeError("DSLD search", "missing hits array");
      return recordArrayField(body, "hits").flatMap(toSearchHit);
    },
  };
}

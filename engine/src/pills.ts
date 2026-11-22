import { isRecord, stringField } from "./sources/http.ts";

export const PILL_SOURCE_IDS = ["dailymed", "pillbox"] as const;
export const PILL_KINDS = ["prescription", "otc", "homeopathic", "animal", "other"] as const;

export type PillSourceId = (typeof PILL_SOURCE_IDS)[number];
export type PillKind = (typeof PILL_KINDS)[number];
export type PillMatch = "exact_imprint" | "close_imprint" | "colour_and_shape";

export const PILL_GUESS_NOTICE =
  "Educated guess from the imprint, colour and shape. Pills that look alike can be different medicines.";
export const MAX_PILL_CANDIDATES = 20;
export const MIN_IMPRINT_LENGTH = 2;

const MATCH_POINTS: Readonly<Record<PillMatch, number>> = { exact_imprint: 100, close_imprint: 70, colour_and_shape: 40 };
const AGREEMENT_POINTS = 15;

export interface PillRecord {
  readonly ndc: string;
  readonly part: number;
  readonly name: string;
  readonly strength: string;
  readonly oralDosageForm?: string;
  readonly maker: string;
  readonly imprint: string;
  readonly colors: readonly string[];
  readonly shape: string;
  readonly sizeMm?: number;
  readonly score?: number;
  readonly setId: string;
  readonly source: PillSourceId;
  readonly date: string;
  readonly kind: PillKind;
  readonly splImage?: string;
  readonly pillboxImage?: string;
}

export interface PillSource {
  readonly id: PillSourceId;
  readonly name: string;
  readonly url: string;
  readonly snapshotDate: string;
  readonly records: number;
}

export interface PillboxImageEntry {
  readonly offset: number;
  readonly compressedSize: number;
}

export interface PillboxImageZip {
  readonly url: string;
  readonly entries: ReadonlyMap<string, PillboxImageEntry>;
}

export interface PillFile {
  readonly sources: readonly PillSource[];
  readonly pillboxImageZip: PillboxImageZip;
  readonly records: readonly PillRecord[];
}

export interface PillQuery {
  readonly imprint: string;
  readonly color?: string;
  readonly shape?: string;
}

export interface PillCandidate {
  readonly score: number;
  readonly match: PillMatch;
  readonly reason: string;
  readonly product: PillRecord;
  readonly sameLook: readonly PillRecord[];
  readonly notice: string;
}

export class PillFileShapeError extends Error {
  constructor(problem: string) {
    super(`The pill file cannot be used: ${problem}. Rebuild it with "npm run build:pills".`);
    this.name = "PillFileShapeError";
  }
}

export const PILL_FILE_FIELDS = [
  "ndc",
  "part",
  "name",
  "strength",
  "maker",
  "imprint",
  "colors",
  "shape",
  "sizeMm",
  "score",
  "setId",
  "source",
  "date",
  "kind",
  "splImage",
  "pillboxImage",
  "oralDosageForm",
] as const;

type PillField = (typeof PILL_FILE_FIELDS)[number];

const DICTIONARY_FIELDS = ["name", "strength", "maker", "colors", "shape", "setId", "source", "date", "kind", "oralDosageForm"] as const;

type DictionaryField = (typeof DICTIONARY_FIELDS)[number];
type Cell = string | number | null;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PRODUCT_NDC = /^\d{4,5}-[0-9A-Z]{3,4}$/;
const COLOR_SEPARATOR = ";";

export function normaliseImprint(text: string): string {
  if (/^(?:none|no imprint|unmarked|blank|unknown|n\/a|not (?:listed|available|applicable))$/i.test(text.trim())) return "";
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isDictionaryField(field: PillField): field is DictionaryField {
  return (DICTIONARY_FIELDS as readonly string[]).includes(field);
}

function rawCell(record: PillRecord, field: PillField): string | number | null {
  if (field === "colors") return record.colors.join(COLOR_SEPARATOR);
  if (field === "oralDosageForm") return record.oralDosageForm ?? "";
  return record[field] ?? null;
}

export function encodePillFile(file: PillFile): unknown {
  const dictionaries = Object.fromEntries(DICTIONARY_FIELDS.map((field) => [field, new Map<string, number>()]));
  const encodeCell = (record: PillRecord, field: PillField): Cell => {
    const value = rawCell(record, field);
    if (!isDictionaryField(field)) return value;
    const dictionary = dictionaries[field];
    if (dictionary === undefined || typeof value !== "string") throw new PillFileShapeError(`${field} must be text`);
    const known = dictionary.get(value);
    if (known !== undefined) return known;
    dictionary.set(value, dictionary.size);
    return dictionary.size - 1;
  };
  const records = file.records.map((record) => PILL_FILE_FIELDS.map((field) => encodeCell(record, field)));
  return {
    sources: file.sources,
    pillbox_image_zip: {
      url: file.pillboxImageZip.url,
      entries: Object.fromEntries([...file.pillboxImageZip.entries].map(([name, entry]) => [name, [entry.offset, entry.compressedSize]])),
    },
    fields: PILL_FILE_FIELDS,
    dictionaries: Object.fromEntries(Object.entries(dictionaries).map(([field, values]) => [field, [...values.keys()]])),
    records,
  };
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown, where: string): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) throw new PillFileShapeError(`${where} is "${String(value)}", expected one of ${allowed.join(", ")}`);
  return found;
}

function requiredDate(value: unknown, where: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) throw new PillFileShapeError(`${where} is "${String(value)}", expected YYYY-MM-DD`);
  return value;
}

function parseSource(raw: unknown, index: number): PillSource {
  const where = `source ${index}`;
  if (!isRecord(raw)) throw new PillFileShapeError(`${where} is not an object`);
  const name = stringField(raw, "name");
  const url = stringField(raw, "url");
  const records = raw["records"];
  if (name === undefined || url === undefined || typeof records !== "number") {
    throw new PillFileShapeError(`${where} needs a name, a url and a record count`);
  }
  return {
    id: oneOf(PILL_SOURCE_IDS, raw["id"], `${where} id`),
    name,
    url,
    snapshotDate: requiredDate(raw["snapshotDate"], `${where} snapshotDate`),
    records,
  };
}

function parseImageZip(raw: unknown): PillboxImageZip {
  if (!isRecord(raw) || typeof raw["url"] !== "string" || !isRecord(raw["entries"])) {
    throw new PillFileShapeError("it has no pillbox_image_zip block");
  }
  const entries = new Map<string, PillboxImageEntry>();
  for (const [name, value] of Object.entries(raw["entries"])) {
    if (!Array.isArray(value) || typeof value[0] !== "number" || typeof value[1] !== "number") {
      throw new PillFileShapeError(`pillbox image ${name} needs an offset and a size`);
    }
    entries.set(name, { offset: value[0], compressedSize: value[1] });
  }
  return { url: raw["url"], entries };
}

type Dictionaries = ReadonlyMap<DictionaryField, readonly string[]>;

function parseDictionaries(raw: unknown, fields: readonly PillField[]): Dictionaries {
  if (!isRecord(raw)) throw new PillFileShapeError("it has no dictionaries block");
  return new Map(
    DICTIONARY_FIELDS.filter((field) => fields.includes(field)).map((field) => {
      const values = raw[field];
      if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) {
        throw new PillFileShapeError(`dictionary ${field} is not a list of text`);
      }
      return [field, values as readonly string[]] as const;
    }),
  );
}

function decodeRecord(
  row: unknown,
  index: number,
  dictionaries: Dictionaries,
  fields: readonly PillField[],
): PillRecord {
  const where = `record ${index}`;
  if (!Array.isArray(row) || row.length !== fields.length) throw new PillFileShapeError(`${where} has the wrong number of fields`);
  const cells = new Map(fields.map((field, position) => [field, row[position] as unknown]));
  const text = (field: PillField): string => {
    const cell = cells.get(field);
    const value = isDictionaryField(field) && typeof cell === "number" ? dictionaries.get(field)?.[cell] : cell;
    if (typeof value !== "string") throw new PillFileShapeError(`${where} has no ${field}`);
    return value;
  };
  const optionalNumber = (field: PillField): number | undefined => {
    const cell = cells.get(field);
    if (cell === null) return undefined;
    if (typeof cell !== "number") throw new PillFileShapeError(`${where} has ${field} that is not a number`);
    return cell;
  };
  const optionalText = (field: PillField): string | undefined => (cells.get(field) === null ? undefined : text(field));
  const ndc = text("ndc");
  if (!PRODUCT_NDC.test(ndc)) throw new PillFileShapeError(`${where} has product NDC "${ndc}"`);
  const colors = text("colors");
  const sizeMm = optionalNumber("sizeMm");
  const score = optionalNumber("score");
  const splImage = optionalText("splImage");
  const pillboxImage = optionalText("pillboxImage");
  return {
    ndc,
    part: optionalNumber("part") ?? 0,
    name: text("name"),
    strength: text("strength"),
    ...(fields.includes("oralDosageForm") ? { oralDosageForm: text("oralDosageForm") } : {}),
    maker: text("maker"),
    imprint: text("imprint"),
    colors: colors === "" ? [] : colors.split(COLOR_SEPARATOR),
    shape: text("shape"),
    ...(sizeMm === undefined ? {} : { sizeMm }),
    ...(score === undefined ? {} : { score }),
    setId: text("setId"),
    source: oneOf(PILL_SOURCE_IDS, text("source"), `${where} source`),
    date: requiredDate(text("date"), `${where} date`),
    kind: oneOf(PILL_KINDS, text("kind"), `${where} kind`),
    ...(splImage === undefined ? {} : { splImage }),
    ...(pillboxImage === undefined ? {} : { pillboxImage }),
  };
}

export function parsePillFile(raw: unknown): PillFile {
  if (!isRecord(raw)) throw new PillFileShapeError("it is not a JSON object");
  const fields = raw["fields"];
  const legacy = PILL_FILE_FIELDS.filter((field) => field !== "oralDosageForm");
  const expected = Array.isArray(fields) && fields.join() === legacy.join() ? legacy : PILL_FILE_FIELDS;
  if (!Array.isArray(fields) || fields.join() !== expected.join()) {
    throw new PillFileShapeError(`its fields are not ${PILL_FILE_FIELDS.join(", ")}`);
  }
  if (!Array.isArray(raw["sources"]) || !Array.isArray(raw["records"])) throw new PillFileShapeError("it has no sources or records");
  const dictionaries = parseDictionaries(raw["dictionaries"], expected);
  return {
    sources: raw["sources"].map(parseSource),
    pillboxImageZip: parseImageZip(raw["pillbox_image_zip"]),
    records: raw["records"].map((row, index) => decodeRecord(row, index, dictionaries, expected)),
  };
}

export function pillColors(records: readonly PillRecord[]): readonly string[] {
  return [...new Set(records.flatMap((record) => record.colors))].sort();
}

export function pillShapes(records: readonly PillRecord[]): readonly string[] {
  return [...new Set(records.map((record) => record.shape).filter((shape) => shape !== ""))].sort();
}

export function imprintSides(imprint: string): readonly string[] {
  return imprint
    .split(";")
    .map((side) => side.trim())
    .filter((side) => side !== "");
}

interface IndexedPill {
  readonly record: PillRecord;
  readonly imprintKeys: readonly string[];
  readonly lookKey?: string;
}

function imprintKeys(imprint: string): readonly string[] {
  const sides = imprintSides(imprint).map(normaliseImprint).filter((side) => side !== "");
  return [...new Set([sides.join(""), [...sides].reverse().join("")])];
}

function strengthKey(strength: string): string {
  return strength
    .toUpperCase()
    .split(";")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .filter((part) => part !== "")
    .sort()
    .join(";");
}

export function isPillForm(form: string | undefined): boolean {
  return /^(?:TABLET|CAPSULE)(?:,|$)/i.test(form ?? "");
}

function indexPill(record: PillRecord): IndexedPill {
  const keys = imprintKeys(record.imprint);
  const strength = strengthKey(record.strength);
  const knownStrength = strength.split(";").every((line) => /^[A-Z][^;]*?\s+\d+(?:\.\d+)?\s*(?:MCG|MG|G|MEQ|IU|UNITS?)$/.test(line));
  const canGroup = knownStrength && keys.some(Boolean) && record.colors.length > 0 && record.shape !== "";
  return {
    record,
    imprintKeys: keys,
    ...(canGroup ? { lookKey: [[...keys].sort()[0], record.colors.join(COLOR_SEPARATOR), record.shape, record.oralDosageForm, strength].join("|") } : {}),
  };
}

const INDEX_CACHE = new WeakMap<readonly PillRecord[], readonly IndexedPill[]>();

function indexed(records: readonly PillRecord[]): readonly IndexedPill[] {
  const cached = INDEX_CACHE.get(records);
  if (cached !== undefined) return cached;
  const built = records.filter((record) => isPillForm(record.oralDosageForm)).map(indexPill);
  INDEX_CACHE.set(records, built);
  return built;
}

export function withinOneEdit(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  let skipped = false;
  let s = 0;
  let l = 0;
  while (s < shorter.length && l < longer.length) {
    if (shorter[s] === longer[l]) {
      s += 1;
      l += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    if (shorter.length === longer.length) s += 1;
    l += 1;
  }
  return true;
}

function imprintMatch(queryKey: string, keys: readonly string[], useImprint: boolean): PillMatch | undefined {
  if (!useImprint) return "colour_and_shape";
  if (keys.includes(queryKey)) return "exact_imprint";
  return keys.some((key) => withinOneEdit(queryKey, key)) ? "close_imprint" : undefined;
}

function disagrees(known: readonly string[], wanted: string | undefined): boolean {
  return wanted !== undefined && known.length > 0 && !known.includes(wanted);
}

function agrees(known: readonly string[], wanted: string | undefined): boolean {
  return wanted !== undefined && known.includes(wanted);
}

function lower(text: string): string {
  return text.toLowerCase();
}

function reasonFor(match: PillMatch, record: PillRecord, query: NormalisedQuery): string {
  const shown = imprintSides(record.imprint).join(" ");
  const imprintLine: Record<PillMatch, string> = {
    exact_imprint: `Imprint ${shown} matches what you typed.`,
    close_imprint: `Imprint ${shown} is one character away from what you typed.`,
    colour_and_shape: "Matched on colour and shape only, not on the imprint.",
  };
  const lines = [imprintLine[match]];
  if (agrees(record.colors, query.color)) lines.push(`Colour ${lower(query.color ?? "")} matches.`);
  else if (query.color !== undefined) lines.push("This record lists no colour.");
  if (agrees(record.shape === "" ? [] : [record.shape], query.shape)) lines.push(`Shape ${lower(query.shape ?? "")} matches.`);
  else if (query.shape !== undefined) lines.push("This record lists no shape.");
  return lines.join(" ");
}

interface NormalisedQuery {
  readonly key: string;
  readonly color?: string;
  readonly shape?: string;
}

function normaliseQuery(query: PillQuery): NormalisedQuery {
  const color = query.color?.trim().toUpperCase();
  const shape = query.shape?.trim().toUpperCase();
  return {
    key: normaliseImprint(query.imprint),
    ...(color ? { color } : {}),
    ...(shape ? { shape } : {}),
  };
}

interface ScoredPill {
  readonly pill: IndexedPill;
  readonly match: PillMatch;
  readonly score: number;
}

function scorePill(pill: IndexedPill, query: NormalisedQuery, useImprint: boolean): ScoredPill | undefined {
  const { record } = pill;
  const shapes = record.shape === "" ? [] : [record.shape];
  if (!useImprint && (!agrees(record.colors, query.color) || !agrees(shapes, query.shape))) return undefined;
  if (disagrees(record.colors, query.color) || disagrees(shapes, query.shape)) return undefined;
  if (!useImprint && query.key && !pill.imprintKeys.includes(query.key)) return undefined;
  const match = imprintMatch(query.key, pill.imprintKeys, useImprint || query.key.length > 0);
  if (match === undefined) return undefined;
  const score =
    MATCH_POINTS[match] +
    (agrees(record.colors, query.color) ? AGREEMENT_POINTS : 0) +
    (agrees(shapes, query.shape) ? AGREEMENT_POINTS : 0);
  return { pill, match, score };
}

function newestFirst(left: PillRecord, right: PillRecord): number {
  return (
    PILL_SOURCE_IDS.indexOf(left.source) - PILL_SOURCE_IDS.indexOf(right.source) ||
    right.date.localeCompare(left.date) ||
    left.ndc.localeCompare(right.ndc) ||
    left.part - right.part
  );
}

function toCandidate(group: readonly ScoredPill[], query: NormalisedQuery): PillCandidate | undefined {
  const best = [...group].sort((left, right) => right.score - left.score || newestFirst(left.pill.record, right.pill.record))[0];
  if (best === undefined) return undefined;
  const records = group.map((scored) => scored.pill.record).sort(newestFirst);
  return {
    score: best.score,
    match: best.match,
    reason: reasonFor(best.match, best.pill.record, query),
    product: best.pill.record,
    sameLook: records.filter((record) => record !== best.pill.record),
    notice: PILL_GUESS_NOTICE,
  };
}

export function findPills(query: PillQuery, records: readonly PillRecord[]): readonly PillCandidate[] {
  const normalised = normaliseQuery(query);
  const useImprint = normalised.key.length >= MIN_IMPRINT_LENGTH;
  if (!useImprint && (normalised.color === undefined || normalised.shape === undefined)) return [];
  const groups = new Map<string | IndexedPill, ScoredPill[]>();
  for (const pill of indexed(records)) {
    const scored = scorePill(pill, normalised, useImprint);
    if (scored === undefined) continue;
    const key = pill.lookKey ?? pill;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [scored]);
    else group.push(scored);
  }
  return [...groups.values()]
    .map((group) => toCandidate(group, normalised))
    .filter((candidate): candidate is PillCandidate => candidate !== undefined)
    .sort(
      (left, right) =>
        right.score - left.score ||
        // More product codes for the same pill means a more widely sold pill, so it is the likelier find.
        right.sameLook.length - left.sameLook.length ||
        newestFirst(left.product, right.product),
    )
    .slice(0, MAX_PILL_CANDIDATES);
}

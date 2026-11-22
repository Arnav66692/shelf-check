import { isRecord, recordArrayField, stringArrayField, stringField } from "./sources/http.ts";
import { spanOf, termRegExp } from "./text.ts";
import type { CabinetItem } from "./types.ts";

export const RECALL_CLASSIFICATIONS = ["Class I", "Class II", "Class III", "Not Yet Classified"] as const;
export const RECALL_STATUSES = ["Ongoing", "Completed", "Terminated"] as const;

export type RecallClassification = (typeof RECALL_CLASSIFICATIONS)[number];
export type RecallStatus = (typeof RECALL_STATUSES)[number];

export interface RecallRecord {
  readonly recallNumber: string;
  readonly classification: RecallClassification;
  readonly status: RecallStatus;
  readonly reason: string;
  readonly productDescription: string;
  readonly codeInfo: string;
  readonly recallingFirm: string;
  readonly initiationDate: string;
  readonly reportDate: string;
  readonly productNdcs: readonly string[];
}

export interface RecallSource {
  readonly url: string;
  readonly lastUpdated: string;
  readonly records: number;
  readonly recordsWithProductNdc: number;
}

export interface RecallFile {
  readonly source: RecallSource;
  readonly recalls: readonly RecallRecord[];
}

export interface NdcRecallMatch {
  readonly match: "product_ndc";
  readonly matchedNdc: string;
  readonly evidence: { readonly ndc: string; readonly field: "productDescription" | "codeInfo" };
  readonly recall: RecallRecord;
}

export interface NameRecallMatch {
  readonly match: "name_match_not_your_vial";
  readonly matchedText: string;
  readonly notice: string;
  readonly recall: RecallRecord;
}

export const NAME_MATCH_NOTICE =
  "Name match, not a match to your vial. This recall names the same ingredient, but it can be a different maker, strength or lot. A recall that is missing from this list does not mean a vial is safe.";

export class RecallFileShapeError extends Error {
  constructor(problem: string) {
    super(`The recall file cannot be used: ${problem}. Rebuild it with "npm run build:recalls".`);
    this.name = "RecallFileShapeError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requiredString(raw: Record<string, unknown>, key: string, where: string): string {
  const value = stringField(raw, key);
  if (value === undefined) throw new RecallFileShapeError(`${where} has no ${key}`);
  return value;
}

function requiredDate(raw: Record<string, unknown>, key: string, where: string): string {
  const value = requiredString(raw, key, where);
  if (!ISO_DATE.test(value)) throw new RecallFileShapeError(`${where} has ${key} "${value}", expected YYYY-MM-DD`);
  return value;
}

function requiredNumber(raw: Record<string, unknown>, key: string, where: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RecallFileShapeError(`${where} has no numeric ${key}`);
  return value;
}

function oneOf<T extends string>(allowed: readonly T[], value: string, key: string, where: string): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) throw new RecallFileShapeError(`${where} has ${key} "${value}", expected one of ${allowed.join(", ")}`);
  return found;
}

function toRecallRecord(raw: Record<string, unknown>, index: number): RecallRecord {
  const where = `recall ${index}`;
  return {
    recallNumber: requiredString(raw, "recall_number", where),
    classification: oneOf(RECALL_CLASSIFICATIONS, requiredString(raw, "classification", where), "classification", where),
    status: oneOf(RECALL_STATUSES, requiredString(raw, "status", where), "status", where),
    reason: requiredString(raw, "reason_for_recall", where),
    productDescription: requiredString(raw, "product_description", where),
    codeInfo: requiredString(raw, "code_info", where),
    recallingFirm: requiredString(raw, "recalling_firm", where),
    initiationDate: requiredDate(raw, "recall_initiation_date", where),
    reportDate: requiredDate(raw, "report_date", where),
    productNdcs: stringArrayField(raw, "product_ndcs"),
  };
}

export function parseRecallFile(raw: unknown): RecallFile {
  if (!isRecord(raw)) throw new RecallFileShapeError("it is not a JSON object");
  const source = raw["source"];
  if (!isRecord(source)) throw new RecallFileShapeError("it has no source block");
  if (!Array.isArray(raw["recalls"])) throw new RecallFileShapeError("it has no recalls array");
  return {
    source: {
      url: requiredString(source, "url", "source"),
      lastUpdated: requiredDate(source, "last_updated", "source"),
      records: requiredNumber(source, "records", "source"),
      recordsWithProductNdc: requiredNumber(source, "records_with_product_ndc", "source"),
    },
    recalls: recordArrayField(raw, "recalls").map(toRecallRecord),
  };
}

function newestFirst<T extends { readonly recall: RecallRecord }>(matches: readonly T[]): readonly T[] {
  return [...matches].sort(
    (left, right) =>
      right.recall.initiationDate.localeCompare(left.recall.initiationDate) ||
      right.recall.reportDate.localeCompare(left.recall.reportDate),
  );
}

const NDC_CODE = /\d{4,5}-\d{3,4}(?:-\d{1,2})?(?![\w-])/;
const LABELED_NDCS = new RegExp(
  `\\bNDC(?:s| number(?:s)?| code(?:s)?)?(?:\\s+(?:bag|blister|carton|vial|bottle))?\\s*[:#-]?\\s*(${NDC_CODE.source}(?:\\s*(?:,|;|and|/)\\s*${NDC_CODE.source})*)`,
  "gi",
);

const RECALL_INDEX = new WeakMap<readonly RecallRecord[], ReadonlyMap<string, readonly NdcRecallMatch[]>>();
const QUALIFIED_CODES = /\b(?:unaffected|not affected|not recalled|except(?:ion|ing)?|exclud(?:e|ed|ing)|incorrect NDC|instead of)\b/i;

function ndcIndex(recalls: readonly RecallRecord[]): ReadonlyMap<string, readonly NdcRecallMatch[]> {
  const cached = RECALL_INDEX.get(recalls);
  if (cached) return cached;
  const index = new Map<string, NdcRecallMatch[]>();
  for (const recall of recalls) {
    if (QUALIFIED_CODES.test(recall.productDescription) || QUALIFIED_CODES.test(recall.codeInfo)) continue;
    const seen = new Set<string>();
    for (const field of ["productDescription", "codeInfo"] as const) {
      for (const list of recall[field].matchAll(LABELED_NDCS)) {
        const before = recall[field].slice(0, list.index);
        if (/\b(?:source|original|manufacturer(?:[’']s)?|mfg\.?)\s*$/i.test(before)) continue;
        for (const code of (list[1] ?? "").matchAll(new RegExp(NDC_CODE.source, "g"))) {
          const ndc = code[0];
          const product = ndc.split("-").slice(0, 2).join("-");
          if (seen.has(product)) continue;
          seen.add(product);
          const matches = index.get(product) ?? [];
          matches.push({ match: "product_ndc", matchedNdc: product, evidence: { ndc, field }, recall });
          index.set(product, matches);
        }
      }
    }
  }
  RECALL_INDEX.set(recalls, index);
  return index;
}

export function findRecalls(item: CabinetItem, recalls: readonly RecallRecord[]): readonly NdcRecallMatch[] {
  const productNdc = item.productNdc?.trim();
  if (!productNdc || !/^\d{4,5}-\d{3,4}$/.test(productNdc)) return [];
  return newestFirst(ndcIndex(recalls).get(productNdc) ?? []);
}

export function findRecallsByText(term: string, recalls: readonly RecallRecord[]): readonly NameRecallMatch[] {
  if (term.trim() === "") return [];
  const pattern = termRegExp(term);
  return newestFirst(
    recalls.flatMap((recall): readonly NameRecallMatch[] => {
      const span = spanOf(pattern, recall.productDescription);
      if (span === undefined) return [];
      const matchedText = recall.productDescription.slice(span.start, span.end);
      return [{ match: "name_match_not_your_vial", matchedText, notice: NAME_MATCH_NOTICE, recall }];
    }),
  );
}

export function recallCoverageNote(source: RecallSource): string {
  return `Matches use explicitly listed NDCs. Check the package and lot against the recall. The FDA supplied harmonized product codes for ${source.recordsWithProductNdc} of the ${source.records} FDA drug recall records (file dated ${source.lastUpdated}). No match does not mean the product is safe.`;
}

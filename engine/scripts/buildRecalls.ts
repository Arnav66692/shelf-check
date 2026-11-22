import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isRecord, recordArrayField, stringArrayField, stringField } from "../src/sources/http.ts";
import { parseRecallFile } from "../src/recalls.ts";

const DEFAULT_ZIP_PATH = fileURLToPath(new URL("../../data/drug-enforcement.json.zip", import.meta.url));
const OUTPUT_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const OUTPUT_PATH = `${OUTPUT_DIR}recalls.json`;
const SOURCE_URL = "https://download.open.fda.gov/drug/enforcement/drug-enforcement-0001-of-0001.json.zip";
const MAX_UNZIPPED_BYTES = 512 * 1024 * 1024;
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/;

class RecallSourceError extends Error {
  constructor(problem: string) {
    super(`Cannot build the recall file: ${problem}.`);
    this.name = "RecallSourceError";
  }
}

function readZippedJson(zipPath: string): unknown {
  const text = execFileSync("unzip", ["-p", zipPath], { encoding: "utf8", maxBuffer: MAX_UNZIPPED_BYTES });
  return JSON.parse(text) as unknown;
}

function isoDate(compact: string | undefined, where: string): string {
  const [, year, month, day] = COMPACT_DATE.exec(compact ?? "") ?? [];
  if (year === undefined || month === undefined || day === undefined) {
    throw new RecallSourceError(`${where} is "${compact ?? "missing"}", expected YYYYMMDD`);
  }
  return `${year}-${month}-${day}`;
}

function productNdcsOf(raw: Record<string, unknown>): readonly string[] {
  const openfda = raw["openfda"];
  return isRecord(openfda) ? stringArrayField(openfda, "product_ndc") : [];
}

// openFDA cuts a long lot list in two, and more_code_info carries on mid-word where code_info stops.
function codeInfoOf(raw: Record<string, unknown>): string {
  return `${stringField(raw, "code_info") ?? ""}${stringField(raw, "more_code_info") ?? ""}`;
}

function toCompactRecall(raw: Record<string, unknown>, index: number): Record<string, unknown> {
  const where = `record ${index} (${stringField(raw, "recall_number") ?? "no recall_number"})`;
  return {
    recall_number: stringField(raw, "recall_number") ?? "",
    classification: stringField(raw, "classification") ?? "",
    status: stringField(raw, "status") ?? "",
    reason_for_recall: stringField(raw, "reason_for_recall") ?? "",
    product_description: stringField(raw, "product_description") ?? "",
    code_info: codeInfoOf(raw),
    recalling_firm: stringField(raw, "recalling_firm") ?? "",
    recall_initiation_date: isoDate(stringField(raw, "recall_initiation_date"), `${where} recall_initiation_date`),
    report_date: isoDate(stringField(raw, "report_date"), `${where} report_date`),
    product_ndcs: productNdcsOf(raw),
  };
}

function lastUpdatedOf(body: Record<string, unknown>): string {
  const meta = body["meta"];
  const lastUpdated = isRecord(meta) ? stringField(meta, "last_updated") : undefined;
  if (lastUpdated === undefined) throw new RecallSourceError("the file has no meta.last_updated");
  return lastUpdated;
}

const zipPath = process.argv[2] ?? DEFAULT_ZIP_PATH;
const body = readZippedJson(zipPath);
if (!isRecord(body) || !Array.isArray(body["results"])) throw new RecallSourceError("the file has no results array");
const raws = recordArrayField(body, "results");
const recalls = raws.map(toCompactRecall);
const compact = {
  source: {
    url: SOURCE_URL,
    last_updated: lastUpdatedOf(body),
    records: recalls.length,
    records_with_product_ndc: raws.filter((raw) => productNdcsOf(raw).length > 0).length,
  },
  recalls,
};
const checked = parseRecallFile(compact);
mkdirSync(OUTPUT_DIR, { recursive: true });
const json = `${JSON.stringify(compact)}\n`;
writeFileSync(OUTPUT_PATH, json);
console.log(
  `Wrote ${OUTPUT_PATH}: ${checked.recalls.length} recalls, ${checked.source.recordsWithProductNdc} with a product NDC, ${Buffer.byteLength(json)} bytes.`,
);

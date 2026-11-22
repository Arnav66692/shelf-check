import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, "cache", "openfda");
const LOG = join(CACHE_DIR, "request-log.jsonl");
const USER_AGENT = "shelf-check-benchmark/0.1";
const PAUSE_MS = 400;
const CAP = 120;
const TEXT_FIELDS_SKIPPED = new Set(["openfda", "set_id", "id", "version", "effective_time", "spl_product_data_elements", "package_label_principal_display_panel"]);
const MECHANISM = [
  ["CYP3A", /\bCYP\s?3A4?\b/i],
  ["CYP2D6", /\bCYP\s?2D6\b/i],
  ["QT", /\bQTc?\b/],
  ["P-gp", /\bP-?gp\b|P-glycoprotein/i],
  ["serotonergic", /serotonergic|serotonin syndrome/i],
  ["CNS depressant", /CNS depressant/i],
  ["bradycardia", /bradycardi/i],
  ["hyperkalemia", /hyperkal/i],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let sent = existsSync(LOG) ? readFileSync(LOG, "utf8").split("\n").filter(Boolean).length : 0;

async function label(productNdc) {
  const url = `https://api.fda.gov/drug/label.json?search=openfda.product_ndc:%22${encodeURIComponent(productNdc)}%22&limit=1`;
  const file = join(CACHE_DIR, `${createHash("sha256").update(url).digest("hex")}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  if (sent >= CAP) throw new Error("openFDA diagnostic cap reached");
  await sleep(PAUSE_MS);
  sent += 1;
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  appendFileSync(LOG, `${JSON.stringify({ n: sent, at: new Date().toISOString(), url, status: response.status })}\n`);
  const data = response.status === 404 ? { results: [] } : await response.json();
  if (response.ok || response.status === 404) writeFileSync(file, JSON.stringify(data));
  return data;
}

function fieldsNaming(record, pattern) {
  return Object.entries(record)
    .filter(([key]) => !TEXT_FIELDS_SKIPPED.has(key))
    .filter(([, value]) => pattern.test(Array.isArray(value) ? value.join(" ") : String(value)))
    .map(([key]) => key);
}

function interactionText(record) {
  return ["drug_interactions", "warnings_and_cautions", "contraindications", "boxed_warning", "warnings", "precautions"]
    .map((key) => (record[key] ?? []).join(" "))
    .join(" ");
}

function nameRegExp(drug) {
  return new RegExp(`\\b${drug.split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
}

async function side(owner, otherDrug) {
  const data = await label(owner.productNdc);
  const record = data.results?.[0];
  if (record === undefined) return { owner: owner.displayName, found: false };
  const text = interactionText(record);
  return {
    owner: owner.displayName,
    found: true,
    namesOtherIn: fieldsNaming(record, nameRegExp(otherDrug)),
    mechanismWords: MECHANISM.filter(([, pattern]) => pattern.test(text)).map(([name]) => name),
  };
}

async function main() {
  mkdirSync(CACHE_DIR, { recursive: true });
  const results = JSON.parse(readFileSync(join(HERE, "results.json"), "utf8"));
  const misses = results.testB.kept.filter((pair) => !pair.flagged);
  const rows = [];
  for (const pair of misses) {
    const aLabel = await side(pair.productA, pair.drugB);
    const bLabel = await side(pair.productB, pair.drugA);
    const named = [aLabel, bLabel].some((s) => s.found && s.namesOtherIn.length > 0);
    const missing = [aLabel, bLabel].some((s) => !s.found);
    const category = named ? "other drug named in a label, app did not flag" : missing ? "a label could not be fetched for diagnosis" : "neither label names the other drug";
    rows.push({ drugA: pair.drugA, drugB: pair.drugB, category, aLabel, bLabel });
  }
  writeFileSync(join(HERE, "diagnose-b-misses.json"), JSON.stringify({ openFdaRequestsLogged: sent, rows }, null, 2));
  const counts = rows.reduce((acc, row) => ({ ...acc, [row.category]: (acc[row.category] ?? 0) + 1 }), {});
  console.log(JSON.stringify({ openFdaRequestsLogged: sent, counts }, null, 2));
  for (const row of rows) {
    console.log(`${row.drugA} + ${row.drugB}: ${row.category}`);
    for (const s of [row.aLabel, row.bLabel]) console.log(`   ${s.owner}: ${s.found ? `names other in [${s.namesOtherIn.join(", ")}], mechanism words [${s.mechanismWords.join(", ")}]` : "no label"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

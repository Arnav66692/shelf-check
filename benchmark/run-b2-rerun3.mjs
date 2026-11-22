import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NDC_ZIP = join(HERE, "..", "data", "drug-ndc.json.zip");
const DDINTER_DIR = join(HERE, "ddinter");
const CACHE_DIR = join(HERE, "cache-b2-rerun3");
const REQUEST_LOG = join(CACHE_DIR, "request-log.jsonl");
const RESULTS_JSON = join(HERE, "results-b2-rerun3.json");
const RESULTS_MD = join(HERE, "RESULTS-B2-RERUN3.md");

const BASE_URL = process.env.BASE_URL?.replace(/\/+$/, "");
const USER_AGENT = "shelf-check-benchmark/0.1";
const PAUSE_MS = 400;
const RETRY_PAUSE_MS = 5000;
const TIMEOUT_MS = 90_000;
const REQUEST_CAP = 700;
const SEED = 20261122;
const SAMPLE_SIZE = 40;
const MAX_CANDIDATES = 120;
const B1_BAR_MIN = 10;
const C1_BAR_MAX = 4;
const LEVEL_RANK = { major: 3, moderate: 2, minor: 1, unknown: 0 };
const SALT_WORDS = new Set(
  (
    "hydrochloride hcl dihydrochloride hydrobromide sodium potassium calcium magnesium maleate tartrate bitartrate " +
    "succinate besylate mesylate dimesylate citrate sulfate phosphate acetate fumarate hemifumarate bromide chloride " +
    "nitrate lactate gluconate disodium dipotassium monohydrate dihydrate trihydrate hemihydrate sesquihydrate anhydrous " +
    "hyclate malate mandelate napsylate pamoate tosylate valerate propionate oxalate benzoate embonate xinafoate camsylate"
  ).split(" "),
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, rng) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function wilson(successes, n, z = 1.959964) {
  if (n === 0) return { low: null, high: null };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function stripSalts(name) {
  const words = name.toLowerCase().trim().split(/\s+/);
  while (words.length > 1 && SALT_WORDS.has(words.at(-1))) words.pop();
  return words.join(" ");
}

function nameMatches(ingredientName, drug) {
  const lower = ingredientName.toLowerCase().trim();
  return lower === drug || stripSalts(lower) === drug;
}

// ---------- network with cache, pacing and a hard cap ----------

function countLoggedRequests() {
  if (!existsSync(REQUEST_LOG)) return 0;
  return readFileSync(REQUEST_LOG, "utf8").split("\n").filter((line) => line.trim() !== "").length;
}

const stats = { networkThisRun: 0, cacheHits: 0, loggedBefore: 0, capHit: false };

function cacheFile(method, path, body) {
  const key = createHash("sha256").update(`${BASE_URL} ${method} ${path} ${body ?? ""}`).digest("hex");
  return join(CACHE_DIR, `${key}.json`);
}

async function sendOnce(method, path, body) {
  if (stats.loggedBefore + stats.networkThisRun >= REQUEST_CAP) {
    stats.capHit = true;
    return { ok: false, status: 0, error: "request cap reached" };
  }
  await sleep(PAUSE_MS);
  stats.networkThisRun += 1;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result;
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "User-Agent": USER_AGENT, ...(body ? { "Content-Type": "application/json" } : {}) },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    result = response.ok && data !== null
      ? { ok: true, status: response.status, data }
      : { ok: false, status: response.status, error: `HTTP ${response.status}: ${text.slice(0, 300)}` };
  } catch (error) {
    result = { ok: false, status: 0, error: `network: ${error.name}: ${error.message}` };
  } finally {
    clearTimeout(timer);
  }
  const entry = { n: stats.loggedBefore + stats.networkThisRun, at: new Date().toISOString(), method, path, status: result.status, ms: Date.now() - started };
  appendFileSync(REQUEST_LOG, `${JSON.stringify(entry)}\n`);
  return result;
}

function isRetryable(result) {
  return !result.ok && result.error !== "request cap reached" && (result.status === 0 || result.status === 429 || result.status >= 500);
}

async function api(method, path, payload) {
  const body = payload === undefined ? undefined : JSON.stringify(payload);
  const file = cacheFile(method, path, body);
  if (existsSync(file)) {
    stats.cacheHits += 1;
    return { ...JSON.parse(readFileSync(file, "utf8")).response, fromCache: true };
  }
  let result = await sendOnce(method, path, body);
  if (isRetryable(result)) {
    await sleep(RETRY_PAUSE_MS);
    result = await sendOnce(method, path, body);
  }
  if (result.ok) writeFileSync(file, JSON.stringify({ request: { method, path, body: payload ?? null }, response: result }));
  return { ...result, fromCache: false };
}

const search = (query) => api("GET", `/api/search?q=${encodeURIComponent(query)}`);
const check = (items) => api("POST", "/api/check", { items, profile: {} });

// ---------- local data ----------

function loadNdc() {
  const raw = execFileSync("unzip", ["-p", NDC_ZIP], { maxBuffer: 600 * 1024 * 1024 });
  return JSON.parse(raw.toString("utf8")).results;
}

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else field += ch;
  }
  fields.push(field);
  return fields;
}

function loadDdinter() {
  const pairs = new Map();
  const displayName = new Map();
  const files = readdirSync(DDINTER_DIR).filter((name) => name.endsWith(".csv")).sort();
  for (const file of files) {
    const lines = readFileSync(join(DDINTER_DIR, file), "utf8").split(/\r?\n/).slice(1);
    for (const line of lines) {
      if (line.trim() === "") continue;
      const [, rawA, , rawB, rawLevel] = parseCsvLine(line);
      const a = rawA.trim().toLowerCase();
      const b = rawB.trim().toLowerCase();
      const level = rawLevel.trim().toLowerCase();
      if (!(level in LEVEL_RANK) || a === b) continue;
      if (!displayName.has(a)) displayName.set(a, rawA.trim());
      if (!displayName.has(b)) displayName.set(b, rawB.trim());
      const key = [a, b].sort().join("|");
      const previous = pairs.get(key);
      if (previous === undefined || LEVEL_RANK[level] > LEVEL_RANK[previous]) pairs.set(key, level);
    }
  }
  return { pairs, displayName, files };
}

function oralSingleIngredientNames(ndc) {
  const names = new Set();
  for (const r of ndc) {
    const ingredients = r.active_ingredients ?? [];
    if (
      r.finished === true &&
      (r.product_type === "HUMAN PRESCRIPTION DRUG" || r.product_type === "HUMAN OTC DRUG") &&
      (r.route ?? []).includes("ORAL") &&
      /TABLET|CAPSULE/.test(r.dosage_form ?? "") &&
      ingredients.length === 1
    ) {
      const lower = ingredients[0].name.toLowerCase().trim();
      names.add(lower);
      names.add(stripSalts(lower));
    }
  }
  return names;
}

// ---------- flag criteria ----------

const hasBoth = (flag, idA, idB) => (flag.itemIds ?? []).includes(idA) && (flag.itemIds ?? []).includes(idB);
const slim = (product) => product && { id: product.id, displayName: product.displayName, productNdc: product.productNdc, kind: product.kind, ingredients: product.ingredients };

function interactionBetween(flags, idA, idB) {
  return flags.filter((flag) => flag.type === "interaction" && hasBoth(flag, idA, idB));
}

// ---------- Tests B and C ----------

function makeResolver(displayName) {
  const memo = new Map();
  return async (drug) => {
    if (memo.has(drug)) return memo.get(drug);
    const found = await search(displayName.get(drug) ?? drug);
    let outcome;
    if (!found.ok) outcome = { ok: false, reason: found.error === "request cap reached" ? "not run (cap)" : `search error: ${found.error}`, transient: true };
    else {
      const products = found.data.products ?? [];
      const chosen = products.find(
        (p) => p.productNdc && p.kind !== "supplement" && (p.ingredients ?? []).length === 1 && nameMatches(p.ingredients[0].name, drug),
      );
      outcome = chosen
        ? { ok: true, product: chosen }
        : { ok: false, reason: `no single-ingredient result for "${displayName.get(drug) ?? drug}" among ${products.length} results (first: ${products.slice(0, 3).map((p) => p.displayName).join("; ") || "none"})` };
    }
    if (!outcome.transient) memo.set(drug, outcome);
    return outcome;
  };
}

async function walkPairs(candidates, resolve, level) {
  const kept = [];
  const skipped = [];
  let tried = 0;
  for (const [a, b] of candidates) {
    if (kept.length >= SAMPLE_SIZE || tried >= MAX_CANDIDATES || stats.capHit) break;
    tried += 1;
    const pair = { drugA: a, drugB: b, ddinterLevel: level(a, b) };
    const left = await resolve(a);
    if (!left.ok) {
      skipped.push({ ...pair, reason: `drug A: ${left.reason}` });
      continue;
    }
    const right = await resolve(b);
    if (!right.ok) {
      skipped.push({ ...pair, reason: `drug B: ${right.reason}` });
      continue;
    }
    const products = { productA: slim(left.product), productB: slim(right.product) };
    if (left.product.id === right.product.id) {
      skipped.push({ ...pair, ...products, reason: "both drugs resolved to the same product" });
      continue;
    }
    const result = await check([left.product, right.product]);
    if (!result.ok) {
      skipped.push({ ...pair, ...products, reason: `check error: ${result.error}` });
      continue;
    }
    const { unchecked, flags } = result.data;
    if (!Array.isArray(unchecked) || !Array.isArray(flags)) {
      skipped.push({ ...pair, ...products, reason: "check response is missing the flags or unchecked array" });
      continue;
    }
    if (unchecked.length > 0) {
      skipped.push({ ...pair, ...products, reason: `label not read for: ${unchecked.join("; ")}` });
      continue;
    }
    const interactions = interactionBetween(flags, left.product.id, right.product.id);
    kept.push({ ...pair, ...products, flagged: interactions.length > 0, interactionFlags: interactions, flags });
  }
  return { tried, kept, skipped };
}

// Keep the previous evaluation sample out of the fresh holdout.
function previousPairs() {
  const prior = JSON.parse(readFileSync(join(HERE, "results-rerun2.json"), "utf8"));
  return new Set([...prior.testB.kept, ...prior.testC.kept].map(
    ({ drugA, drugB }) => [drugA, drugB].sort().join("|"),
  ));
}

function testBCandidates(pairs, pool, previous) {
  const majors = [...pairs.entries()]
    .filter(([key, level]) => level === "major" && !previous.has(key) && key.split("|").every((drug) => pool.has(drug)))
    .map(([key]) => key)
    .sort();
  return { count: majors.length, ordered: shuffled(majors, mulberry32(SEED)).map((key) => key.split("|")) };
}

function* testCCandidates(pairs, pool, previous) {
  const drugs = [...pool].sort();
  const rng = mulberry32(SEED);
  const seen = new Set();
  let draws = 0;
  while (draws < 1_000_000) {
    draws += 1;
    const a = drugs[Math.floor(rng() * drugs.length)];
    const b = drugs[Math.floor(rng() * drugs.length)];
    if (a === b) continue;
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    if (pairs.has(key) || previous.has(key)) continue;
    yield key.split("|");
  }
}

function summarise(walk, bar, meetsBar) {
  const hits = walk.kept.filter((pair) => pair.flagged).length;
  const n = walk.kept.length;
  const base = { hits, n, tried: walk.tried, skipped: walk.skipped.length, wilson95: wilson(hits, n) };
  return { ...base, bar, verdict: n === SAMPLE_SIZE && meetsBar(hits) ? "PASS" : "FAIL" };
}

// ---------- report ----------

const pct = (hits, n) => (n === 0 ? "n/a" : `${((100 * hits) / n).toFixed(1)}%`);
const ci = (w) => (w.low === null ? "n/a" : `${(100 * w.low).toFixed(1)}% to ${(100 * w.high).toFixed(1)}%`);
const clip = (text, max = 220) => {
  const flat = String(text ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  return flat.length > max ? `${flat.slice(0, max - 3)}...` : flat;
};
const firstQuote = (flag) => flag?.quotes?.[0];
const quoteCell = (flag) => {
  const quote = firstQuote(flag);
  return quote ? `"${clip(quote.excerpt)}" (${quote.section})` : "no quote";
};

function generatedReport(results) {
  const { testB, testC, meta } = results;
  const B1 = testB.summary;
  const C1 = testC.summary;
  const lines = [
    `Generated by run-b2.mjs at ${meta.finishedAt} against ${meta.baseUrl} with seed ${meta.seed}. Preregistration SHA-256 ${meta.preregSha256.slice(0, 16)}...`,
    "",
    "| Measure | Result | 95% Wilson interval | Bar | Verdict |",
    "| --- | --- | --- | --- | --- |",
    `| B1 interaction flag on a DDInter Major pair | ${B1.hits} of ${B1.n} (${pct(B1.hits, B1.n)}) | ${ci(B1.wilson95)} | ${B1.bar} | ${B1.verdict} |`,
    `| C1 interaction flag on a pair absent from DDInter | ${C1.hits} of ${C1.n} (${pct(C1.hits, C1.n)}) | ${ci(C1.wilson95)} | ${C1.bar} | ${C1.verdict} |`,
    "",
    "Test C counts flags on pairs absent from the eight downloaded DDInter files. This count is an upper bound on false alarms.",
    "",
    `${meta.requests.totalLogged} network requests logged across all runs (cap ${REQUEST_CAP}), ${meta.requests.networkThisRun} sent in the last run, ${meta.requests.cacheHits} answered from cache in the last run.`,
    "",
    `Test B had ${testB.candidateCount} eligible Major pairs in the pool of ${meta.poolSize} drugs. ${B1.tried} candidates tried, ${B1.n} kept, ${B1.skipped} skipped.`,
    `Test C had ${C1.tried} candidates tried, ${C1.n} kept, ${C1.skipped} skipped.`,
    "",
    "### Test B, first five kept pairs",
    "",
    "| Drugs | Products | Interaction flag | Label line quoted |",
    "| --- | --- | --- | --- |",
    ...testB.kept.slice(0, 5).map(
      (p) => `| ${p.drugA} + ${p.drugB} | ${clip(p.productA.displayName, 50)} + ${clip(p.productB.displayName, 50)} | ${p.flagged ? "yes" : "no"} | ${p.flagged ? quoteCell(p.interactionFlags[0]) : "none"} |`,
    ),
    "",
    "### Test C, first five kept pairs",
    "",
    "| Drugs | Products | Interaction flag | Label line quoted |",
    "| --- | --- | --- | --- |",
    ...testC.kept.slice(0, 5).map(
      (p) => `| ${p.drugA} + ${p.drugB} | ${clip(p.productA.displayName, 50)} + ${clip(p.productB.displayName, 50)} | ${p.flagged ? "yes" : "no"} | ${p.flagged ? quoteCell(p.interactionFlags[0]) : "none"} |`,
    ),
    "",
    "### Every Test B hit",
    "",
    ...flaggedList(testB.kept),
    "",
    "### Every Test C flag, for human review",
    "",
    ...flaggedList(testC.kept),
    "",
    "### Skipped pairs in Tests B and C",
    "",
    ...[...testB.skipped.map((s) => ({ ...s, test: "B" })), ...testC.skipped.map((s) => ({ ...s, test: "C" }))].map(
      (s) => `- ${s.test}: ${s.drugA} + ${s.drugB}: ${clip(s.reason, 220)}`,
    ),
  ];
  return lines.join("\n");
}

function flaggedList(pairs) {
  const flagged = pairs.filter((p) => p.flagged);
  if (flagged.length === 0) return ["None."];
  return flagged.flatMap((p) => [
    `- **${p.drugA} + ${p.drugB}** (${clip(p.productA.displayName, 60)} + ${clip(p.productB.displayName, 60)}), DDInter level: ${p.ddinterLevel ?? "absent"}`,
    ...p.interactionFlags.flatMap((f) => (f.quotes ?? []).map((q) => `  - ${q.section}: "${clip(q.excerpt, 300)}"`)),
  ]);
}

function writeReport(results) {
  const start = "<!-- generated:start -->";
  const end = "<!-- generated:end -->";
  const block = `${start}\n${generatedReport(results)}\n${end}`;
  const existing = existsSync(RESULTS_MD) ? readFileSync(RESULTS_MD, "utf8") : `# Shelf Check interaction benchmark B2 rerun 3 results (same frozen pairs, after the Nov 22 round-2 engine fixes)\n\n${start}\n${end}\n`;
  const pattern = new RegExp(`${start}[\\s\\S]*${end}`);
  writeFileSync(RESULTS_MD, pattern.test(existing) ? existing.replace(pattern, block) : `${existing}\n${block}\n`);
}

// ---------- main ----------

async function main() {
  if (!BASE_URL) throw new Error("Set BASE_URL to the Shelf Check server URL.");
  mkdirSync(CACHE_DIR, { recursive: true });
  stats.loggedBefore = countLoggedRequests();
  const startedAt = new Date().toISOString();
  const preregSha256 = createHash("sha256").update(readFileSync(join(HERE, "PREREG-B2.md"))).digest("hex");
  const manifest = readFileSync(join(HERE, "PREREG.sha256"), "utf8").split(/\r?\n/);
  if (!manifest.includes(`${preregSha256}  PREREG-B2.md`)) {
    throw new Error("PREREG-B2.md does not match PREREG.sha256.");
  }

  const ndc = loadNdc();
  const ddinter = loadDdinter();
  const oralNames = oralSingleIngredientNames(ndc);
  const pool = new Set([...ddinter.displayName.keys()].filter((drug) => oralNames.has(drug)));
  const level = (a, b) => ddinter.pairs.get([a, b].sort().join("|")) ?? null;
  console.log(`NDC records ${ndc.length}, DDInter pairs ${ddinter.pairs.size}, DDInter drugs ${ddinter.displayName.size}, pool ${pool.size}`);

  const resolve = makeResolver(ddinter.displayName);
  const previous = previousPairs();
  const bCandidates = testBCandidates(ddinter.pairs, pool, previous);
  const bWalk = await walkPairs(bCandidates.ordered, resolve, level);
  const testB = {
    candidateCount: bCandidates.count,
    ...bWalk,
    summary: summarise(bWalk, `at least ${B1_BAR_MIN} of ${SAMPLE_SIZE}`, (hits) => hits >= B1_BAR_MIN),
  };
  console.log("Test B", JSON.stringify(testB.summary));

  const cWalk = await walkPairs(testCCandidates(ddinter.pairs, pool, previous), resolve, level);
  const testC = {
    ...cWalk,
    summary: summarise(cWalk, `at most ${C1_BAR_MAX} of ${SAMPLE_SIZE}`, (hits) => hits <= C1_BAR_MAX),
  };
  console.log("Test C", JSON.stringify(testC.summary));

  const results = {
    meta: {
      startedAt,
      finishedAt: new Date().toISOString(),
      preregSha256,
      seed: SEED,
      baseUrl: BASE_URL,
      ddinterFiles: ddinter.files,
      ndcRecords: ndc.length,
      ddinterPairs: ddinter.pairs.size,
      poolSize: pool.size,
      requests: { networkThisRun: stats.networkThisRun, cacheHits: stats.cacheHits, totalLogged: countLoggedRequests(), cap: REQUEST_CAP, capHit: stats.capHit },
    },
    testB,
    testC,
  };
  writeFileSync(RESULTS_JSON, JSON.stringify(results, null, 2));
  writeReport(results);
  console.log("requests", JSON.stringify(results.meta.requests));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

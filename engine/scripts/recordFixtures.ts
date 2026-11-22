import { buildCabinetItem } from "../src/cabinet.ts";
import type { FetchFn } from "../src/sources/http.ts";
import { createDsldClient } from "../src/sources/dsld.ts";
import { createOpenFdaClient } from "../src/sources/openfda.ts";
import { createRxNavClient } from "../src/sources/rxnav.ts";
import { buildSupplementItem } from "../src/supplement.ts";
import {
  appendRecordedRequest,
  findReplayable,
  fixtureFileName,
  fixtureKey,
  readFixtureBody,
  readRecordedRequests,
} from "../test/support/fixtures.ts";
import {
  DSLD_SEARCHES,
  EXTRA_RXNAV_NAMES,
  MISSING_DSLD_ID,
  MISSING_PRODUCT_NDC,
  PRODUCT_NDCS,
  SUPPLEMENT_DSLD_IDS,
} from "../test/support/products.ts";

const OPENFDA_HOST = "api.fda.gov";
const DSLD_HOST = "api.ods.od.nih.gov";
const REQUEST_CAPS: Readonly<Record<string, number>> = { [OPENFDA_HOST]: 60, [DSLD_HOST]: 60 };
const MILLISECONDS_BETWEEN_REQUESTS = 150;
const CLASS_MEMBER_FIXTURES: readonly (readonly [string, string])[] = [["M01A", "ATC"]];

function requestCount(host: string): number {
  return readRecordedRequests().filter((request) => new URL(request.url).host === host).length;
}

let lastRequest: Promise<void> = Promise.resolve();

function politely<T>(send: () => Promise<T>): Promise<T> {
  const result = lastRequest.then(send);
  lastRequest = result.then(
    () => new Promise<void>((resolve) => setTimeout(resolve, MILLISECONDS_BETWEEN_REQUESTS)),
    () => undefined,
  );
  return result;
}

async function fetchAndRecord(url: string): Promise<{ readonly status: number; readonly body: string }> {
  const recorded = findReplayable(url);
  if (recorded !== undefined) return { status: recorded.status, body: readFixtureBody(recorded) };
  const host = new URL(url).host;
  const cap = REQUEST_CAPS[host];
  if (cap !== undefined && requestCount(host) >= cap) {
    throw new Error(`${host} request cap of ${cap} reached. Not sending ${fixtureKey(url)}.`);
  }
  const response = await fetch(url);
  const body = await response.text();
  const publicUrl = `https://${fixtureKey(url)}`;
  appendRecordedRequest(
    { url: publicUrl, status: response.status, file: fixtureFileName(url), fetchedAt: new Date().toISOString() },
    body,
  );
  console.log(`fetched ${response.status} ${fixtureKey(url)}`);
  return { status: response.status, body };
}

const recordingFetch: FetchFn = async (url) => {
  const { status, body } = await politely(() => fetchAndRecord(url));
  return { status, text: async () => body };
};

const openFda = createOpenFdaClient({ fetch: recordingFetch });
const rxNav = createRxNavClient({ fetch: recordingFetch });
const dsld = createDsldClient({ fetch: recordingFetch });

const searches = process.argv.slice(2);
for (const search of searches) {
  const products = await openFda.searchNdc(search, 5);
  console.log(search, JSON.stringify(products, null, 2));
}

for (const [id, productNdc] of Object.entries(PRODUCT_NDCS)) {
  const item = await buildCabinetItem({ id, productNdc }, { openFda, rxNav });
  const summary = item.ingredients.map((ingredient) => `${ingredient.name} ${ingredient.value} ${ingredient.unit}`);
  console.log(`${id} (${item.kind}) ${item.displayName}: ${summary.join(", ")}. Label ${item.label ? "found" : "MISSING"}`);
}

console.log(`missing product lookup: ${JSON.stringify(await openFda.getNdcProduct(MISSING_PRODUCT_NDC))}`);
for (const [classId, relaSource] of CLASS_MEMBER_FIXTURES) {
  const members = await rxNav.getClassMembers(classId, relaSource);
  console.log(`${classId} members: ${members.length}`);
}
for (const [query, size] of DSLD_SEARCHES) {
  const hits = await dsld.search(query, size);
  console.log(`DSLD search "${query}": ${hits.map((hit) => `${hit.id} ${hit.brandName ?? ""} ${hit.fullName}`).join(" | ")}`);
}
for (const [id, dsldId] of Object.entries(SUPPLEMENT_DSLD_IDS)) {
  const item = await buildSupplementItem({ id, dsldId }, { dsld, rxNav });
  const summary = item.ingredients.map(
    (ingredient) => `${ingredient.name} [${ingredient.rxcui ?? "no rxcui"}] ${ingredient.value} ${ingredient.unit}`,
  );
  console.log(`${id} (${item.kind}) ${item.displayName}: ${summary.join(", ")}. Daily servings ${JSON.stringify(item.dailyServings)}`);
}
try {
  console.log(`missing supplement lookup: ${JSON.stringify(await dsld.getLabel(MISSING_DSLD_ID))}`);
} catch (error) {
  console.log(`missing supplement lookup failed: ${String(error)}`);
}
for (const name of EXTRA_RXNAV_NAMES) {
  const rxcui = await rxNav.findRxcui(name);
  const base = rxcui === null ? [] : await rxNav.getBaseIngredients(rxcui);
  console.log(`${name}: ${rxcui ?? "no rxcui"} ${base.map((concept) => concept.name).join(", ")}`);
}
for (const host of Object.keys(REQUEST_CAPS)) {
  console.log(`${host} requests recorded so far: ${requestCount(host)} of ${REQUEST_CAPS[host]}`);
}

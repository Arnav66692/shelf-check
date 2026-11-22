import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { FetchFn } from "../src/http.ts";
import { FIXTURE_DIR, INDEX_PATH, readFixtureBody, readFixtureIndex } from "../test/fixtureFetch.ts";

const REQUEST_LOG_PATH = `${FIXTURE_DIR}request-log.jsonl`;
const OPENFDA_HOST = "api.fda.gov";
const OPENFDA_REQUEST_CAP = 46;
const HASH_LENGTH = 16;

function withoutApiKey(url: string): string {
  const parsed = new URL(url);
  if (!parsed.searchParams.has("api_key")) return url;
  return url.replace(/[?&]api_key=[^&]*/, "");
}

export function requestCounts(): Readonly<Record<string, number>> {
  if (!existsSync(REQUEST_LOG_PATH)) return {};
  return readFileSync(REQUEST_LOG_PATH, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => (JSON.parse(line) as { host: string }).host)
    .reduce<Record<string, number>>((counts, host) => ({ ...counts, [host]: (counts[host] ?? 0) + 1 }), {});
}

export const recordingFetch: FetchFn = async (url) => {
  const key = withoutApiKey(url);
  const known = readFixtureIndex()[key];
  if (known) return { status: known.status, text: async () => readFixtureBody(known) };

  const host = new URL(url).host;
  if (host === OPENFDA_HOST && (requestCounts()[host] ?? 0) >= OPENFDA_REQUEST_CAP) {
    throw new Error(`openFDA request cap of ${OPENFDA_REQUEST_CAP} reached, refusing ${key}`);
  }
  appendFileSync(REQUEST_LOG_PATH, `${JSON.stringify({ at: new Date().toISOString(), host, url: key })}\n`);
  const response = await fetch(url);
  const body = await response.text();
  const file = `bodies/${host}-${createHash("sha256").update(key).digest("hex").slice(0, HASH_LENGTH)}.txt`;
  writeFileSync(`${FIXTURE_DIR}${file}`, body);
  writeFileSync(INDEX_PATH, `${JSON.stringify({ ...readFixtureIndex(), [key]: { status: response.status, file } }, null, 2)}\n`);
  console.error(`  recorded ${response.status} ${key}`);
  return { status: response.status, text: async () => body };
};

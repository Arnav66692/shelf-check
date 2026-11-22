import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FetchFn } from "../../src/sources/http.ts";

export const FIXTURE_DIR = fileURLToPath(new URL("../../fixtures/", import.meta.url));
const INDEX_PATH = `${FIXTURE_DIR}index.json`;
const REPLAYABLE_STATUSES: readonly number[] = [200, 404];

export interface RecordedRequest {
  readonly url: string;
  readonly status: number;
  readonly file: string;
  readonly fetchedAt: string;
}

export function fixtureKey(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete("api_key");
  return `${parsed.host}${parsed.pathname}?${decodeURIComponent(parsed.searchParams.toString())}`;
}

export function fixtureFileName(url: string): string {
  return `${fixtureKey(url).replace(/[^A-Za-z0-9.-]+/g, "_").replace(/^_+|_+$/g, "")}.json`;
}

export function readRecordedRequests(): readonly RecordedRequest[] {
  if (!existsSync(INDEX_PATH)) return [];
  return JSON.parse(readFileSync(INDEX_PATH, "utf8")) as readonly RecordedRequest[];
}

export function appendRecordedRequest(request: RecordedRequest, body: string): void {
  writeFileSync(`${FIXTURE_DIR}${request.file}`, body);
  writeFileSync(INDEX_PATH, `${JSON.stringify([...readRecordedRequests(), request], null, 2)}\n`);
}

export function findReplayable(url: string): RecordedRequest | undefined {
  const key = fixtureKey(url);
  return readRecordedRequests().find(
    (request) => fixtureKey(request.url) === key && REPLAYABLE_STATUSES.includes(request.status),
  );
}

export function readFixtureBody(request: RecordedRequest): string {
  return readFileSync(`${FIXTURE_DIR}${request.file}`, "utf8");
}

export function createFixtureFetch(): FetchFn {
  return async (url) => {
    const recorded = findReplayable(url);
    if (recorded === undefined) {
      throw new Error(`No fixture recorded for ${fixtureKey(url)}. Tests run offline. Add it with "npm run record".`);
    }
    const body = readFixtureBody(recorded);
    return { status: recorded.status, text: async () => body };
  };
}

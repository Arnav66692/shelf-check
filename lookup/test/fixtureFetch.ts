import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FetchFn } from "../src/http.ts";

export const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/", import.meta.url));
export const INDEX_PATH = `${FIXTURE_DIR}index.json`;

export interface FixtureEntry {
  readonly status: number;
  readonly file: string;
}

export type FixtureIndex = Readonly<Record<string, FixtureEntry>>;

export function readFixtureIndex(): FixtureIndex {
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf8")) as FixtureIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function readFixtureBody(entry: FixtureEntry): string {
  return readFileSync(`${FIXTURE_DIR}${entry.file}`, "utf8");
}

export function createFixtureFetch(): { readonly fetch: FetchFn; readonly requested: () => readonly string[] } {
  const index = readFixtureIndex();
  const requested: string[] = [];
  return {
    requested: () => [...requested],
    fetch: async (url) => {
      requested.push(url);
      const entry = index[url];
      if (!entry) throw new Error(`No recorded fixture for ${url}. Tests run offline, record it with npm run record.`);
      return { status: entry.status, text: async () => readFixtureBody(entry) };
    },
  };
}

export function readFixtureJson(url: string): unknown {
  const entry = readFixtureIndex()[url];
  if (!entry) throw new Error(`No recorded fixture for ${url}.`);
  return JSON.parse(readFixtureBody(entry)) as unknown;
}

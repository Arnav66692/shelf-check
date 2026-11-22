import { createLookup } from "../src/lookup.ts";
import type { LookupOptions } from "../src/lookup.ts";
import type { FetchFn } from "../src/http.ts";
import { createFixtureFetch } from "./fixtureFetch.ts";

export interface OfflineLookup {
  readonly lookup: ReturnType<typeof createLookup>;
  readonly requested: () => readonly string[];
}

export function offlineLookup(options: Omit<LookupOptions, "fetch"> = {}): OfflineLookup {
  const fixtures = createFixtureFetch();
  return { lookup: createLookup({ env: {}, ...options, fetch: fixtures.fetch }), requested: fixtures.requested };
}

export function failingHost(host: string, status: number, body: string): FetchFn {
  const fixtures = createFixtureFetch();
  return async (url) => (new URL(url).host === host ? { status, text: async () => body } : fixtures.fetch(url));
}

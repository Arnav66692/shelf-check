import { HttpStatusError, MalformedResponseError, NetworkError, RateLimitError } from "./errors.ts";
import type { ApiSource } from "./errors.ts";

export interface FetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

export type FetchFn = (url: string) => Promise<FetchResponse>;

export interface JsonResponse {
  readonly url: string;
  readonly status: number;
  readonly body: unknown;
}

export type JsonGetter = (url: string) => Promise<JsonResponse>;

export interface JsonGetterOptions {
  readonly source: ApiSource;
  readonly fetch: FetchFn;
  readonly acceptedStatuses: readonly number[];
  readonly decorateUrl?: (url: string) => string;
}

export const STATUS_OK = 200;
export const STATUS_NOT_FOUND = 404;
const STATUS_RATE_LIMITED = 429;

const NETWORK_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 400;

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readBody(url: string, options: JsonGetterOptions): Promise<{ status: number; text: string }> {
  let lastCause: unknown;
  for (let attempt = 1; attempt <= NETWORK_ATTEMPTS; attempt += 1) {
    try {
      const response = await options.fetch(options.decorateUrl ? options.decorateUrl(url) : url);
      return { status: response.status, text: await response.text() };
    } catch (cause) {
      lastCause = cause;
      if (attempt < NETWORK_ATTEMPTS) await pause(RETRY_PAUSE_MS * attempt);
    }
  }
  throw new NetworkError(options.source, url, lastCause);
}

async function fetchJson(url: string, options: JsonGetterOptions): Promise<JsonResponse> {
  const { status, text } = await readBody(url, options);
  if (status === STATUS_RATE_LIMITED) throw new RateLimitError(options.source, url);
  if (!options.acceptedStatuses.includes(status)) throw new HttpStatusError(options.source, url, status, text);
  try {
    return { url, status, body: JSON.parse(text) as unknown };
  } catch (cause) {
    throw new MalformedResponseError(options.source, url, `the body is not JSON (${String(cause)})`);
  }
}

export function createCachedJsonGetter(options: JsonGetterOptions): JsonGetter {
  const cache = new Map<string, Promise<JsonResponse>>();
  return (url) => {
    const cached = cache.get(url);
    if (cached) return cached;
    const pending = fetchJson(url, options).catch((error: unknown) => {
      cache.delete(url);
      throw error;
    });
    cache.set(url, pending);
    return pending;
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function childRecord(parent: unknown, key: string): Record<string, unknown> {
  if (!isRecord(parent)) return {};
  const child = parent[key];
  return isRecord(child) ? child : {};
}

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function recordArrayField(record: Record<string, unknown>, key: string): readonly Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function stringArrayField(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

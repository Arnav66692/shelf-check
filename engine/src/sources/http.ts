export interface FetchResponse {
  readonly status: number;
  text(): Promise<string>;
}

export type FetchFn = (url: string) => Promise<FetchResponse>;

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

export type JsonGetter = (url: string) => Promise<JsonResponse>;

export class HttpError extends Error {
  readonly url: string;
  readonly status: number;

  constructor(url: string, status: number, detail: string) {
    super(`Request failed with status ${status} for ${url}: ${detail}`);
    this.name = "HttpError";
    this.url = url;
    this.status = status;
  }
}

export class ResponseShapeError extends Error {
  constructor(source: string, problem: string) {
    super(`Unexpected ${source} response: ${problem}`);
    this.name = "ResponseShapeError";
  }
}

export interface JsonGetterOptions {
  readonly fetch: FetchFn;
  readonly acceptedStatuses: readonly number[];
  readonly decorateUrl?: (url: string) => string;
}

async function fetchJson(url: string, options: JsonGetterOptions): Promise<JsonResponse> {
  const response = await options.fetch(options.decorateUrl ? options.decorateUrl(url) : url);
  const text = await response.text();
  if (!options.acceptedStatuses.includes(response.status)) {
    throw new HttpError(url, response.status, text.slice(0, 200));
  }
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch (cause) {
    throw new ResponseShapeError(url, `body is not JSON (${String(cause)})`);
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

export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function recordArrayField(record: Record<string, unknown>, key: string): readonly Record<string, unknown>[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function stringArrayField(record: Record<string, unknown>, key: string): readonly string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

import { describe, expect, test } from "vitest";
import { HttpStatusError, LookupError, MalformedResponseError, NetworkError, RateLimitError } from "../src/errors.ts";
import { createLookup } from "../src/lookup.ts";
import type { FetchFn } from "../src/http.ts";
import { createFixtureFetch } from "./fixtureFetch.ts";
import { failingHost } from "./offline.ts";

const OPENFDA_HOST = "api.fda.gov";
const DAILYMED_HOST = "dailymed.nlm.nih.gov";
const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_BODY = '{"error":{"code":"OVER_RATE_LIMIT"}}';

function always(status: number, body: string): FetchFn {
  return async () => ({ status, text: async () => body });
}

describe("error paths", () => {
  test("blocks any real network call in tests", () => {
    expect(() => fetch("https://api.fda.gov/drug/ndc.json")).toThrow("Real network call attempted");
  });

  test("raises a typed rate limit error on HTTP 429", async () => {
    const lookup = createLookup({ env: {}, fetch: always(RATE_LIMIT_STATUS, RATE_LIMIT_BODY) });
    const failure = await lookup.findByNdc("50580-590").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RateLimitError);
    expect(failure).toMatchObject({ source: "openfda", message: expect.stringContaining("OPENFDA_API_KEY") });
  });

  test("raises the rate limit error from a name search when every source is limited", async () => {
    const lookup = createLookup({ env: {}, fetch: always(RATE_LIMIT_STATUS, RATE_LIMIT_BODY) });
    await expect(lookup.searchByName("melatonin")).rejects.toBeInstanceOf(RateLimitError);
  });

  test("keeps the supplement results and reports the error when only openFDA is limited", async () => {
    const lookup = createLookup({ env: {}, fetch: failingHost(OPENFDA_HOST, RATE_LIMIT_STATUS, RATE_LIMIT_BODY) });
    const result = await lookup.searchByName("melatonin");

    expect(result.groups.length).toBeGreaterThan(0);
    expect(result.groups.every((group) => group.product.source === "dsld")).toBe(true);
    expect(result.sourceErrors).toHaveLength(1);
    expect(result.sourceErrors[0]).toBeInstanceOf(RateLimitError);
  });

  test("still finds a supplement by barcode when openFDA is limited, and reports the error", async () => {
    const lookup = createLookup({ env: {}, fetch: failingHost(OPENFDA_HOST, RATE_LIMIT_STATUS, RATE_LIMIT_BODY) });
    const result = await lookup.findByBarcode("033984019560");

    expect(result).toMatchObject({ status: "found", products: [{ displayName: "Melatonin 10 mg" }] });
    expect(result.status === "found" ? result.sourceErrors[0] : undefined).toBeInstanceOf(RateLimitError);
  });

  test("does not call a barcode a miss when openFDA could not be asked", async () => {
    const lookup = createLookup({ env: {}, fetch: failingHost(OPENFDA_HOST, RATE_LIMIT_STATUS, RATE_LIMIT_BODY) });
    await expect(lookup.findByBarcode("312345987657")).rejects.toBeInstanceOf(RateLimitError);
  });

  test("raises a typed error for a body that is not JSON", async () => {
    const lookup = createLookup({ env: {}, fetch: always(200, "<html>Service unavailable</html>") });
    const failure = await lookup.findByNdc("50580-590").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MalformedResponseError);
    expect(failure).toMatchObject({ source: "openfda", message: expect.stringContaining("not JSON") });
  });

  test("raises a typed error for JSON of the wrong shape", async () => {
    const lookup = createLookup({ env: {}, fetch: always(200, '{"unexpected":true}') });

    await expect(lookup.findByNdc("50580-590")).rejects.toBeInstanceOf(MalformedResponseError);
    await expect(lookup.findByBarcode("033984019560")).rejects.toBeInstanceOf(MalformedResponseError);
  });

  test("raises a typed error for an unexpected status", async () => {
    const lookup = createLookup({ env: {}, fetch: always(500, "Internal Server Error") });
    const failure = await lookup.findByNdc("50580-590").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpStatusError);
    expect(failure).toMatchObject({ status: 500 });
  });

  test("raises a typed error when the request itself fails", async () => {
    const lookup = createLookup({
      env: {},
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    const failure = await lookup.findByNdc("50580-590").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(NetworkError);
    expect(failure).toBeInstanceOf(LookupError);
  });

  test("returns the match without pictures and reports the error when DailyMed fails", async () => {
    const lookup = createLookup({ env: {}, fetch: failingHost(DAILYMED_HOST, 503, "down") });
    const result = await lookup.findByNdc("50580-590");

    expect(result).toMatchObject({ status: "found", products: [{ displayName: "TYLENOL Extra Strength", labelImages: [] }] });
    expect(result.status === "found" ? result.sourceErrors[0] : undefined).toBeInstanceOf(HttpStatusError);
  });

  test("does not cache a failed request", async () => {
    const fixtures = createFixtureFetch();
    const outcomes: FetchFn[] = [always(RATE_LIMIT_STATUS, RATE_LIMIT_BODY), fixtures.fetch];
    const lookup = createLookup({ env: {}, fetch: (url) => (new URL(url).host === OPENFDA_HOST ? (outcomes.shift() ?? fixtures.fetch)(url) : fixtures.fetch(url)) });

    await expect(lookup.findByNdc("50580-590")).rejects.toBeInstanceOf(RateLimitError);
    expect(await lookup.findByNdc("50580-590")).toMatchObject({ status: "found" });
  });
});

describe("openFDA API key", () => {
  const seen = (): { readonly urls: string[]; readonly fetch: FetchFn } => {
    const fixtures = createFixtureFetch();
    const urls: string[] = [];
    return {
      urls,
      fetch: (url) => {
        urls.push(url);
        return fixtures.fetch(url.replace(/&api_key=[^&]*/, ""));
      },
    };
  };

  test("appends the key from the environment to openFDA requests only", async () => {
    const spy = seen();
    const lookup = createLookup({ env: { OPENFDA_API_KEY: " key-from-env " }, fetch: spy.fetch });
    await lookup.findByNdc("50580-590");

    const openFdaUrls = spy.urls.filter((url) => url.includes(OPENFDA_HOST));
    expect(openFdaUrls).toHaveLength(1);
    expect(openFdaUrls[0]).toMatch(/&api_key=key-from-env$/);
    expect(spy.urls.filter((url) => !url.includes(OPENFDA_HOST)).some((url) => url.includes("api_key"))).toBe(false);
  });

  test("sends no key when the environment has none", async () => {
    const spy = seen();
    await createLookup({ env: { OPENFDA_API_KEY: "  " }, fetch: spy.fetch }).findByNdc("50580-590");

    expect(spy.urls.some((url) => url.includes("api_key"))).toBe(false);
  });
});

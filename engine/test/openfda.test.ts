import { describe, expect, test } from "vitest";
import { HttpError, ResponseShapeError } from "../src/sources/http.ts";
import type { FetchFn } from "../src/sources/http.ts";
import { createOpenFdaClient, openFdaApiKeyFromEnv, parseStrength, StrengthParseError } from "../src/sources/openfda.ts";
import { createFixtureFetch } from "./support/fixtures.ts";
import { MISSING_PRODUCT_NDC, PRODUCT_NDCS } from "./support/products.ts";

function countingFetch(inner: FetchFn): { readonly fetch: FetchFn; readonly urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    fetch: (url) => {
      urls.push(url);
      return inner(url);
    },
  };
}

describe("parseStrength", () => {
  test("reads a strength per single unit", () => {
    expect(parseStrength("500 mg/1")).toEqual({ value: 500, unit: "mg", per: { value: 1, unit: "each" } });
  });

  test("reads a liquid strength per volume", () => {
    expect(parseStrength("12.5 mg/5mL")).toEqual({ value: 12.5, unit: "mg", per: { value: 5, unit: "mL" } });
    expect(parseStrength("650 mg/30mL")).toEqual({ value: 650, unit: "mg", per: { value: 30, unit: "mL" } });
  });

  test("keeps microgram units as written", () => {
    expect(parseStrength("137 ug/1")).toEqual({ value: 137, unit: "ug", per: { value: 1, unit: "each" } });
  });

  test("treats a bare denominator unit as one of that unit", () => {
    expect(parseStrength("5 mg/mL")).toEqual({ value: 5, unit: "mg", per: { value: 1, unit: "mL" } });
  });

  test("throws a clear error for text that is not a strength", () => {
    expect(() => parseStrength("two tablets")).toThrow(StrengthParseError);
  });
});

describe("openFDA client", () => {
  test("returns the active ingredient and strength for Tylenol Extra Strength", async () => {
    const client = createOpenFdaClient({ fetch: createFixtureFetch() });

    const product = await client.getNdcProduct(PRODUCT_NDCS.tylenol);

    expect(product?.activeIngredients).toEqual([{ name: "ACETAMINOPHEN", strength: "500 mg/1" }]);
    expect(product?.productType).toBe("HUMAN OTC DRUG");
  });

  test("returns the OTC label sections as text arrays", async () => {
    const client = createOpenFdaClient({ fetch: createFixtureFetch() });

    const label = await client.getLabel(PRODUCT_NDCS.tylenol);

    expect(label?.dosage_and_administration?.[0]).toContain("do not take more than 6 tablets in 24 hours");
    expect(label?.drug_interactions).toBeUndefined();
  });

  test("returns null when openFDA has no match", async () => {
    const client = createOpenFdaClient({ fetch: createFixtureFetch() });

    expect(await client.getNdcProduct(MISSING_PRODUCT_NDC)).toBeNull();
  });

  test("asks the network once for repeated lookups of the same product", async () => {
    const counting = countingFetch(createFixtureFetch());
    const client = createOpenFdaClient({ fetch: counting.fetch });

    await client.getNdcProduct(PRODUCT_NDCS.tylenol);
    await client.getNdcProduct(PRODUCT_NDCS.tylenol);

    expect(counting.urls).toHaveLength(1);
  });

  test("appends the API key only when one is given", async () => {
    const withKey = countingFetch(createFixtureFetch());
    const withoutKey = countingFetch(createFixtureFetch());

    await createOpenFdaClient({ fetch: withKey.fetch, apiKey: "test-key" }).getNdcProduct(PRODUCT_NDCS.tylenol);
    await createOpenFdaClient({ fetch: withoutKey.fetch, env: {} }).getNdcProduct(PRODUCT_NDCS.tylenol);

    expect(withKey.urls[0]).toContain("&api_key=test-key");
    expect(withoutKey.urls[0]).not.toContain("api_key");
  });

  test("reads the optional key from OPENFDA_API_KEY in the environment", async () => {
    const counting = countingFetch(createFixtureFetch());
    const client = createOpenFdaClient({ fetch: counting.fetch, env: { OPENFDA_API_KEY: " env-key " } });

    await client.getNdcProduct(PRODUCT_NDCS.tylenol);

    expect(counting.urls[0]).toContain("&api_key=env-key");
    expect(openFdaApiKeyFromEnv({})).toBeUndefined();
    expect(openFdaApiKeyFromEnv({ OPENFDA_API_KEY: "" })).toBeUndefined();
  });

  test("throws instead of returning nothing when the server refuses the request", async () => {
    const refusing: FetchFn = async () => ({ status: 429, text: async () => "" });
    const client = createOpenFdaClient({ fetch: refusing, env: {} });

    await expect(client.getNdcProduct(PRODUCT_NDCS.tylenol)).rejects.toThrow(HttpError);
  });

  test("throws when a successful answer does not have the expected shape", async () => {
    const shapeless: FetchFn = async () => ({ status: 200, text: async () => "{}" });
    const client = createOpenFdaClient({ fetch: shapeless, env: {} });

    await expect(client.getNdcProduct(PRODUCT_NDCS.tylenol)).rejects.toThrow(ResponseShapeError);
  });
});

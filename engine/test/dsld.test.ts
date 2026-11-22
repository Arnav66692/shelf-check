import { describe, expect, test } from "vitest";
import { createDsldClient } from "../src/sources/dsld.ts";
import { HttpError, ResponseShapeError } from "../src/sources/http.ts";
import type { FetchFn } from "../src/sources/http.ts";
import { createFixtureFetch } from "./support/fixtures.ts";
import { MISSING_DSLD_ID, SUPPLEMENT_DSLD_IDS } from "./support/products.ts";

describe("DSLD client", () => {
  test("reads the name, brand, barcode, serving and ingredient rows of a label", async () => {
    const client = createDsldClient({ fetch: createFixtureFetch() });

    const label = await client.getLabel(SUPPLEMENT_DSLD_IDS.melatonin);

    expect(label).toMatchObject({ id: "13302", fullName: "Melatonin 10 mg", brandName: "Solgar", upcSku: "0 33984 01956 0" });
    expect(label?.servingSizes).toEqual([
      { unit: "Tablet(s)", minQuantity: 1, maxQuantity: 1, minDailyServings: 1, maxDailyServings: 1 },
    ]);
    expect(label?.ingredientRows[0]).toMatchObject({
      name: "Melatonin",
      ingredientGroup: "Melatonin",
      quantity: [{ quantity: 10, unit: "mg", servingSizeQuantity: 1, servingSizeUnit: "Tablet(s)" }],
    });
  });

  test("keeps nested rows, forms, other ingredients and label statements", async () => {
    const client = createDsldClient({ fetch: createFixtureFetch() });

    const fishOil = await client.getLabel(SUPPLEMENT_DSLD_IDS.fishOil);
    const concentrate = fishOil?.ingredientRows.find((row) => row.name === "Fish Oil concentrate");

    expect(concentrate?.nestedRows.map((row) => row.name)).toEqual(["Omega-3 Fatty Acid Ethyl Ester"]);
    expect(fishOil?.otherIngredients[0]).toEqual({ name: "Fish Oil", forms: ["Anchovies", "Herring", "Mackerel", "Sardines"] });
    expect(fishOil?.statements).toContainEqual({
      type: "Suggested/Recommended/Usage/Directions",
      notes: "Suggested Use: Adults, take one packet daily, preferably with a meal.",
    });
  });

  test("searches labels by text", async () => {
    const client = createDsldClient({ fetch: createFixtureFetch() });

    const hits = await client.search("melatonin", 5);

    expect(hits).toHaveLength(5);
    expect(hits).toContainEqual({ id: "320628", fullName: "Melatonin 3 mg", brandName: "Wellness Resources" });
  });

  test("returns null for a label id DSLD does not have", async () => {
    const client = createDsldClient({ fetch: createFixtureFetch() });

    expect(await client.getLabel(MISSING_DSLD_ID)).toBeNull();
  });

  test("throws when the server refuses or sends a body that is not a label", async () => {
    const refusing: FetchFn = async () => ({ status: 500, text: async () => "" });
    const shapeless: FetchFn = async () => ({ status: 200, text: async () => "{}" });

    await expect(createDsldClient({ fetch: refusing }).getLabel("13302")).rejects.toThrow(HttpError);
    await expect(createDsldClient({ fetch: shapeless }).getLabel("13302")).rejects.toThrow(ResponseShapeError);
    await expect(createDsldClient({ fetch: shapeless }).search("melatonin", 5)).rejects.toThrow(ResponseShapeError);
  });
});

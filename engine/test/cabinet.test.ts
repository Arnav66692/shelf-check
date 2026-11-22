import { describe, expect, test } from "vitest";
import { buildCabinetItem, ProductNotFoundError } from "../src/cabinet.ts";
import { fixtureSources, loadCabinet } from "./support/cabinet.ts";
import { MISSING_PRODUCT_NDC } from "./support/products.ts";

describe("buildCabinetItem", () => {
  test("builds NyQuil with base ingredient names and liquid strengths", async () => {
    const [nyquil] = await loadCabinet("nyquil");

    expect(nyquil?.kind).toBe("otc");
    expect(nyquil?.verified).toBe(true);
    expect(nyquil?.ingredients.map(({ name, value, unit, per }) => ({ name, value, unit, per }))).toEqual([
      { name: "acetaminophen", value: 650, unit: "mg", per: { value: 30, unit: "mL" } },
      { name: "dextromethorphan", value: 30, unit: "mg", per: { value: 30, unit: "mL" } },
      { name: "doxylamine", value: 12.5, unit: "mg", per: { value: 30, unit: "mL" } },
    ]);
  });

  test("marks warfarin as a prescription product in the vitamin K antagonist class", async () => {
    const [warfarin] = await loadCabinet("warfarin");

    expect(warfarin?.kind).toBe("rx");
    expect(warfarin?.ingredients[0]?.name).toBe("warfarin");
    expect(warfarin?.ingredients[0]?.classes?.map((drugClass) => drugClass.id)).toContain("B01AA");
  });

  test("refuses to invent an item when openFDA has no record", async () => {
    const request = { id: "missing", productNdc: MISSING_PRODUCT_NDC };

    await expect(buildCabinetItem(request, fixtureSources())).rejects.toThrow(ProductNotFoundError);
  });
});

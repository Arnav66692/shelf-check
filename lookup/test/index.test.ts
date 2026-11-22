import { expect, test } from "vitest";
import * as lookup from "../src/index.ts";

test("exports the ready-to-use functions and they reject bad input without a request", async () => {
  expect(await lookup.findByBarcode("300931713019")).toMatchObject({ status: "not_found", reason: "unrecognised_code" });
  expect(await lookup.findByNdc("abc")).toMatchObject({ status: "not_found", reason: "unrecognised_code" });
  expect((await lookup.searchByName("")).groups).toEqual([]);
  expect(typeof lookup.getLabel).toBe("function");
  expect(typeof lookup.getLabelImages).toBe("function");
  expect(lookup.parseStrength("137 ug/1")).toEqual({ value: 137, unit: "ug", per: { value: 1, unit: "each" } });
});

test("the ready-to-use functions go to the network, which tests block", async () => {
  await expect(lookup.findByNdc("50580-590")).rejects.toBeInstanceOf(lookup.NetworkError);
});

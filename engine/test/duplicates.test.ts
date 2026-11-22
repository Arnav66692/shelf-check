import { describe, expect, test } from "vitest";
import { duplicateFlags } from "../src/flags/duplicates.ts";
import { expectVerbatim, loadCabinet, withoutLabel } from "./support/cabinet.ts";

describe("duplicate ingredient flag", () => {
  test("Tylenol plus NyQuil is flagged for acetaminophen with the label's own warning", async () => {
    const items = await loadCabinet("tylenol", "nyquil");

    const flags = duplicateFlags(items);

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "duplicate_ingredient", severity: "stop", itemIds: ["tylenol", "nyquil"] });
    expect(flags[0]?.title).toContain("acetaminophen");
    expect(flags[0]?.quote?.text).toBe(
      "Do not use with any other drug containing acetaminophen (prescription or nonprescription).",
    );
    expectVerbatim(flags[0]?.quote, items);
  });

  test("Benadryl plus Tylenol PM is flagged for diphenhydramine", async () => {
    const items = await loadCabinet("benadryl", "tylenolPm");

    const flags = duplicateFlags(items);

    expect(flags).toHaveLength(1);
    expect(flags[0]?.itemIds).toEqual(["benadryl", "tylenolPm"]);
    expect(flags[0]?.title).toContain("diphenhydramine");
    expect(flags[0]?.quote?.text).toContain("any other product containing diphenhydramine");
    expectVerbatim(flags[0]?.quote, items);
  });

  test("three products with the same ingredient give one flag that lists all three", async () => {
    const items = await loadCabinet("tylenol", "nyquil", "tylenolPm");

    const acetaminophen = duplicateFlags(items).filter((flag) => flag.title.includes("acetaminophen"));

    expect(acetaminophen).toHaveLength(1);
    expect(acetaminophen[0]?.itemIds).toEqual(["tylenol", "nyquil", "tylenolPm"]);
  });

  test("products with different ingredients give no flag", async () => {
    const items = await loadCabinet("loratadine", "tylenol", "warfarin");

    expect(duplicateFlags(items)).toEqual([]);
  });

  test("without any label text the flag still fires, at ask level and with no quote", async () => {
    const items = (await loadCabinet("tylenol", "nyquil")).map(withoutLabel);

    const [flag] = duplicateFlags(items);

    expect(flag?.severity).toBe("ask");
    expect(flag?.quote).toBeUndefined();
  });
});

import { describe, expect, test } from "vitest";
import {
  DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT,
  disposalAdvice,
  FLUSH_LIST,
  FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT,
  TAKE_BACK_FIRST_STATEMENT,
} from "../src/disposal.ts";
import type { CabinetItem } from "../src/types.ts";
import { loadCabinet, loadSupplements } from "./support/cabinet.ts";

function item(displayName: string, ...ingredientNames: readonly string[]): CabinetItem {
  return {
    id: "item",
    displayName,
    kind: "rx",
    ingredients: ingredientNames.map((name) => ({ name, value: 1, unit: "mg" })),
    verified: true,
  };
}

describe("FLUSH_LIST", () => {
  test("has the thirteen entries of the FDA page", () => {
    expect(FLUSH_LIST.map((entry) => entry.id)).toEqual([
      "buprenorphine",
      "fentanyl",
      "hydrocodone",
      "hydromorphone",
      "meperidine",
      "methadone",
      "morphine",
      "oxycodone",
      "oxymorphone",
      "tapentadol",
      "sodium_oxybate",
      "diazepam_rectal_gel",
      "methylphenidate_transdermal_system",
    ]);
  });
});

describe("disposalAdvice", () => {
  test("a product with oxycodone is on the flush list, with take-back first", () => {
    const advice = disposalAdvice(item("Oxycodone and Acetaminophen", "oxycodone", "acetaminophen"));

    expect(advice.status).toBe("on_flush_list");
    expect(advice.matches.map((match) => match.entry.id)).toEqual(["oxycodone"]);
    expect(advice.statements).toContain(TAKE_BACK_FIRST_STATEMENT);
    expect(advice.statements).toContain(FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT);
    expect(advice.summary).toContain("The FDA puts a take-back option first.");
  });

  test.each([
    ["benzhydrocodone", "hydrocodone"],
    ["hydrocodone bitartrate", "hydrocodone"],
    ["BUPRENORPHINE HYDROCHLORIDE", "buprenorphine"],
    ["sodium oxybate", "sodium_oxybate"],
    ["tapentadol", "tapentadol"],
  ])("an ingredient named %s matches the %s entry", (ingredientName, entryId) => {
    const advice = disposalAdvice(item("Product", ingredientName));

    expect(advice.status).toBe("on_flush_list");
    expect(advice.matches.map((match) => match.entry.id)).toEqual([entryId]);
  });

  test("hydromorphone matches its own entry and not the morphine entry", () => {
    const advice = disposalAdvice(item("Hydromorphone", "hydromorphone"));

    expect(advice.matches.map((match) => match.entry.id)).toEqual(["hydromorphone"]);
  });

  test("the product name alone is enough when the ingredients were not resolved", () => {
    expect(disposalAdvice(item("Fentanyl Transdermal System")).status).toBe("on_flush_list");
  });

  test("diazepam is listed as a rectal gel only, so a plain diazepam product is not put on the list", () => {
    const tablets = disposalAdvice(item("Diazepam Tablets", "diazepam"));
    const gel = disposalAdvice(item("Diazepam Rectal Gel", "diazepam"));

    expect(tablets.status).toBe("listed_in_one_form_only");
    expect(tablets.summary).toContain("this app cannot tell if it is that form");
    expect(tablets.statements).toContain(DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT);
    expect(gel.status).toBe("on_flush_list");
  });

  test("methylphenidate is listed as a transdermal system only", () => {
    expect(disposalAdvice(item("Methylphenidate ER Tablets", "methylphenidate")).status).toBe("listed_in_one_form_only");
    expect(disposalAdvice(item("Methylphenidate Transdermal System", "methylphenidate")).status).toBe("on_flush_list");
  });

  test("the recorded products and supplements are not on the flush list and get take-back first guidance", async () => {
    const items = [...(await loadCabinet("tylenol", "warfarin", "sertraline", "nyquil")), ...(await loadSupplements("melatonin"))];

    for (const cabinetItem of items) {
      const advice = disposalAdvice(cabinetItem);

      expect(advice.itemId).toBe(cabinetItem.id);
      expect(advice.status).toBe("not_on_flush_list");
      expect(advice.matches).toEqual([]);
      expect(advice.statements).toContain(TAKE_BACK_FIRST_STATEMENT);
      expect(advice.statements).toContain(DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT);
      expect(advice.statements).not.toContain(FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT);
    }
  });
});

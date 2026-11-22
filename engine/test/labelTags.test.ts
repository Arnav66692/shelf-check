import { describe, expect, test } from "vitest";
import { LABEL_TAGS, labelTagFlags } from "../src/flags/labelTags.ts";
import type { CabinetItem, Flag, LabelTag } from "../src/types.ts";
import { expectVerbatim, loadCabinet, loadSupplements, withoutLabel } from "./support/cabinet.ts";
import type { ProductId } from "./support/cabinet.ts";
import { PRODUCT_NDCS } from "./support/products.ts";

const ALL_PRODUCTS = Object.keys(PRODUCT_NDCS) as ProductId[];

const TAGS_ON_REAL_LABELS: Readonly<Record<ProductId, readonly LabelTag[]>> = {
  tylenol: ["alcohol"],
  nyquil: ["alcohol", "drowsiness"],
  benadryl: ["alcohol", "drowsiness"],
  tylenolPm: ["alcohol", "drowsiness"],
  aspirin: ["alcohol"],
  warfarin: ["grapefruit"],
  lisinoprilHctz: ["alcohol", "sun"],
  sertraline: ["alcohol", "drowsiness"],
  ibuprofen: ["alcohol"],
  loratadine: ["drowsiness"],
};

function tagsOf(flags: readonly Flag[], itemId: string): readonly (LabelTag | undefined)[] {
  return flags.filter((flag) => flag.itemIds[0] === itemId).map((flag) => flag.tag);
}

function flagFor(flags: readonly Flag[], itemId: string, tag: LabelTag): Flag | undefined {
  return flags.find((flag) => flag.itemIds[0] === itemId && flag.tag === tag);
}

describe("labelTagFlags on the recorded labels", () => {
  test.each(ALL_PRODUCTS)("%s carries exactly the tags its real label contains", async (id) => {
    const items = await loadCabinet(id);

    expect(tagsOf(labelTagFlags(items), id)).toEqual(TAGS_ON_REAL_LABELS[id]);
  });

  test("every tag flag is info, names one item and quotes the label word for word", async () => {
    const items = await loadCabinet(...ALL_PRODUCTS);

    const flags = labelTagFlags(items);

    expect(flags).toHaveLength(15);
    for (const flag of flags) {
      expect(flag).toMatchObject({ type: "label_tag", severity: "info" });
      expect(flag.itemIds).toHaveLength(1);
      expect(flag.match?.kind).toBe("label_tag");
      expect(flag.quote?.excerpt).toContain(flag.match?.text);
      expectVerbatim(flag.quote, items);
    }
  });

  test("warfarin's grapefruit line comes from the drug interactions section", async () => {
    const items = await loadCabinet("warfarin");

    const flag = flagFor(labelTagFlags(items), "warfarin", "grapefruit");

    expect(flag?.quote?.section).toBe("drug_interactions");
    expect(flag?.quote?.text).toContain("grapefruit juice");
    expect(flag?.match).toEqual({ text: "grapefruit", term: "grapefruit", kind: "label_tag" });
  });

  test("the sun line on lisinopril with hydrochlorothiazide comes from information for patients", async () => {
    const items = await loadCabinet("lisinoprilHctz");

    const flag = flagFor(labelTagFlags(items), "lisinoprilHctz", "sun");

    expect(flag?.quote?.section).toBe("information_for_patients");
    expect(flag?.quote?.text).toContain("protect skin from the sun");
  });

  test("Tylenol PM's drowsiness line is the when using line about driving and machinery", async () => {
    const items = await loadCabinet("tylenolPm");

    const flag = flagFor(labelTagFlags(items), "tylenolPm", "drowsiness");

    expect(flag?.quote?.section).toBe("when_using");
    expect(flag?.quote?.text).toContain("do not drive a motor vehicle or operate machinery");
  });

  test("the same real sentence under Do not use becomes a stop flag", async () => {
    const [benadryl] = await loadCabinet("benadryl");
    if (benadryl === undefined) throw new Error("fixture missing");
    const moved: CabinetItem = { ...benadryl, label: { do_not_use: benadryl.label?.when_using ?? [] } };

    const flags = labelTagFlags([moved]);

    expect(tagsOf(flags, "benadryl")).toEqual(["alcohol", "drowsiness"]);
    expect(flags.map((flag) => flag.severity)).toEqual(["stop", "stop"]);
    expect(flags[0]?.quote?.section).toBe("do_not_use");
  });

  test("there is at most one flag per item per tag", async () => {
    const items = await loadCabinet(...ALL_PRODUCTS);

    const keys = labelTagFlags(items).map((flag) => `${flag.itemIds[0]}:${flag.tag}`);

    expect(new Set(keys).size).toBe(keys.length);
    expect(LABEL_TAGS).toEqual(["alcohol", "grapefruit", "drowsiness", "sun"]);
  });

  test("real supplement labels are tagged too: melatonin for alcohol and machinery, St. John's wort for sunlight", async () => {
    const items = await loadSupplements("melatonin", "stJohnsWort", "fishOil", "vitaminD3", "ginkgo", "vitaminK", "melatonin3mg");

    const flags = labelTagFlags(items);

    expect(flags.map((flag) => `${flag.itemIds[0]}:${flag.tag}`)).toEqual(["melatonin:alcohol", "melatonin:drowsiness", "stJohnsWort:sun"]);
    expect(flagFor(flags, "stJohnsWort", "sun")?.match?.text).toBe("sunlight");
    for (const flag of flags) expectVerbatim(flag.quote, items);
  });

  test("an item with no label gives no tags", async () => {
    const [tylenol] = await loadCabinet("tylenol");
    if (tylenol === undefined) throw new Error("fixture missing");

    expect(labelTagFlags([withoutLabel(tylenol)])).toEqual([]);
  });

  test("the input cabinet is not changed", async () => {
    const items = await loadCabinet("nyquil", "warfarin");
    const before = JSON.stringify(items);

    labelTagFlags(items);

    expect(JSON.stringify(items)).toBe(before);
  });
});

import { describe, expect, test } from "vitest";
import { checkCabinet } from "../src/index.ts";
import { peptideCabinetFlags, peptideCabinetItem } from "../src/peptideCabinet.ts";
import { NO_APPROVED_USE_NOTICE, PEPTIDE_LABELS } from "../src/peptideLabels.ts";
import type { ProductLabel } from "../src/peptideLabels.ts";
import { PEPTIDE_IDS, PEPTIDES } from "../src/peptides.ts";
import type { CabinetItem } from "../src/types.ts";
import { flagsOfType, loadCabinet } from "./support/cabinet.ts";
import { readOfficialFile } from "./support/officialPages.ts";

function ozempicLabel(): ProductLabel {
  const entry = PEPTIDE_LABELS.semaglutide;
  const label = entry.approved ? entry.products.find((product) => product.brand === "Ozempic") : undefined;
  if (label === undefined) throw new Error("The Ozempic label is missing from PEPTIDE_LABELS");
  return label;
}

function ozempicItem(): CabinetItem {
  const label = ozempicLabel();
  const xml = readOfficialFile(`peptide-labels/dailymed-spl-${label.setId}.xml`);
  const strength = /<numerator unit="(\w+)" value="([\d.]+)"\/>\s*<denominator unit="(\w+)" value="([\d.]+)"\/>/.exec(xml);
  if (strength?.[1] === undefined || strength[2] === undefined || strength[3] === undefined || strength[4] === undefined) {
    throw new Error("No strength in the saved Ozempic label");
  }
  return {
    id: "ozempic",
    displayName: label.brand,
    kind: "rx",
    ingredients: [
      { name: "semaglutide", value: Number(strength[2]), unit: strength[1], per: { value: Number(strength[4]), unit: strength[3] } },
    ],
    label: {
      indications_and_usage: label.indications,
      dosage_and_administration: label.dosing,
      boxed_warning: label.boxedWarning ?? [],
      contraindications: label.contraindications ?? [],
    },
    verified: true,
  };
}

const UNAPPROVED = PEPTIDE_IDS.filter((id) => PEPTIDES[id].approvedProducts.length === 0);
const STILL_SOLD = PEPTIDE_IDS.filter((id) => PEPTIDES[id].approvedProducts.some((product) => product.status === "prescription"));

describe("peptideCabinetItem", () => {
  test("makes an unverified vial with the peptide name, strength 0 and no label", () => {
    expect(peptideCabinetItem({ id: "vial-1", peptideId: "bpc_157" })).toEqual({
      id: "vial-1",
      displayName: "BPC-157",
      kind: "vial",
      ingredients: [{ name: "BPC-157", value: 0, unit: "mg" }],
      verified: false,
    });
  });
});

describe("peptideCabinetFlags", () => {
  test.each(UNAPPROVED)("%s gives one ask flag that says there is no FDA-approved product", (peptideId) => {
    const peptide = PEPTIDES[peptideId];

    const flags = peptideCabinetFlags([peptideCabinetItem({ id: "vial", peptideId })]);

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      type: "profile",
      severity: "ask",
      itemIds: ["vial"],
      title: `${peptide.name} has no FDA-approved product`,
      source: peptide.fdaStatement,
    });
    expect(flags[0]?.detail).toContain(NO_APPROVED_USE_NOTICE);
  });

  test.each(STILL_SOLD)("%s gives no extra flag, since the real product should be added by name", (peptideId) => {
    expect(peptideCabinetFlags([peptideCabinetItem({ id: "vial", peptideId })])).toEqual([]);
  });

  test("sermorelin is flagged because its only approved product is discontinued", () => {
    const flags = peptideCabinetFlags([peptideCabinetItem({ id: "vial", peptideId: "sermorelin" })]);

    expect(flags.map((flag) => flag.title)).toEqual(["sermorelin has no FDA-approved product on the market"]);
    expect(flags[0]?.explain).toContain("Geref, is discontinued");
  });

  test("products that are not vials are left alone", async () => {
    expect(peptideCabinetFlags([...(await loadCabinet("warfarin")), ozempicItem()])).toEqual([]);
  });
});

describe("checkCabinet with peptide vials", () => {
  test("warfarin plus BPC-157 runs, and only the peptide flag comes from the vial", async () => {
    const items = [...(await loadCabinet("warfarin")), peptideCabinetItem({ id: "bpc", peptideId: "bpc_157" })];

    const flags = checkCabinet(items);

    expect(flags).toEqual([]);
    expect(peptideCabinetFlags(items).map((flag) => flag.itemIds)).toEqual([["bpc"]]);
  });

  test("Ozempic plus a semaglutide vial flags the shared ingredient and adds up nothing it cannot read", () => {
    const items = [ozempicItem(), peptideCabinetItem({ id: "sema-vial", peptideId: "semaglutide" })];

    const flags = checkCabinet(items);
    const [dailyTotal] = flagsOfType(flags, "daily_total");

    expect(flagsOfType(flags, "duplicate_ingredient").map((flag) => flag.itemIds)).toEqual([["ozempic", "sema-vial"]]);
    expect(dailyTotal?.numbers?.["totalMgPerDayAtEachMaximum"]).toBeNull();
    expect(flags.every((flag) => Object.values(flag.numbers ?? {}).every((value) => value === null || Number.isFinite(value)))).toBe(true);
    expect(peptideCabinetFlags(items)).toEqual([]);
  });

  test("Ozempic plus a TB-500 vial runs and the vial gets its own flag", () => {
    const items = [ozempicItem(), peptideCabinetItem({ id: "tb", peptideId: "tb_500" })];

    expect(checkCabinet(items)).toEqual([]);
    expect(peptideCabinetFlags(items).map((flag) => flag.title)).toEqual(["TB-500 has no FDA-approved product"]);
  });
});

import { expect, test } from "vitest";
import passages from "../fixtures/official/mechanism-interaction-passages.json";
import { interactionFlags } from "../src/flags/interactions.ts";
import type { CabinetItem } from "../src/types.ts";
import { expectVerbatim, fixtureSources, loadCabinet } from "./support/cabinet.ts";

// Each passage is from Drug Interactions in the indicated SPL set ID and version.
function labelItem(key: keyof typeof passages): CabinetItem {
  const { productNdc, displayName, ingredient, value, unit, drug_interactions } = passages[key];
  return {
    id: productNdc, productNdc, displayName, verified: true, kind: "rx",
    ingredients: [{ name: ingredient, value, unit }], label: { drug_interactions },
  };
}

// These oral products and strengths are from the saved openFDA NDC bulk data.
// Use the base ingredient names a resolved cabinet item supplies to the matcher.
function oralDrug(productNdc: string, ingredient: string, mg: number): CabinetItem {
  return {
    id: productNdc, productNdc, displayName: ingredient, verified: true, kind: "rx", routes: ["ORAL"],
    ingredients: [{ name: ingredient, value: mg, unit: "mg" }],
  };
}
const itraconazole = oralDrug("16571-245", "itraconazole", 100);
const paroxetine = oralDrug("60505-1316", "paroxetine", 12.5);
const verapamil = oralDrug("42291-854", "verapamil", 80);
const rifampin = oralDrug("60687-575", "rifampin", 150);
const ketoconazole = oralDrug("72189-180", "ketoconazole", 200);
const nefazodone = oralDrug("0093-1026", "nefazodone", 250);

// The EPC-based rules use class names. Vary the source and type to exercise the provenance checks.
function withClass(name: string, className: string, source = "FDASPL", type = "EPC"): CabinetItem {
  return {
    id: name, displayName: name, kind: "rx", verified: true, ingredients: [{
      name, value: 1, unit: "mg", classes: [{ id: className, name: className, type, source }],
    }],
  };
}

test.each([
  { owner: "nourianz", other: labelItem("lysodren"), member: "mitotane", mechanism: /strong CYP3A(?:4)? inducer/i },
  { owner: "nilotinib", other: itraconazole, member: "itraconazole", mechanism: /strong CYP3A(?:4)? inhibitor/i },
  { owner: "pitolisant", other: paroxetine, member: "paroxetine", mechanism: /strong CYP2D6 inhibitor/i },
  { owner: "gavreto", other: verapamil, member: "verapamil", mechanism: /P[- ]?gp inhibitor/i },
  { owner: "abiraterone", other: rifampin, member: "rifampin", mechanism: /strong CYP3A(?:4)? inducer/i },
] as const)("$owner label identifies $member through its FDA class", ({ owner, other, member, mechanism }) => {
  const source = labelItem(owner);
  const items = [source, other];
  const flags = interactionFlags(items).filter((flag) => flag.itemIds[0] === source.id);
  expect(flags).toHaveLength(1);
  const [flag] = flags;
  expect(flag?.match).toMatchObject({ kind: "class_phrase", ingredient: member });
  expect(flag?.match?.text).toMatch(mechanism);
  expect(flag?.matchedBecause).toMatch(mechanism);
  expect(flag?.matchedBecause).toContain(member);
  expect(flag?.matchedBecause).toMatch(/FDA/i);
  expect(flag?.matchedBecause).toMatch(/Table\s+\d/i);
  expectVerbatim(flag?.quote, items);
  if (owner === "nourianz") {
    const supporting = flag?.supportingQuotes?.find((quote) => quote.itemId === other.id);
    expect(supporting?.text).toBe("Mitotane is a strong CYP3A inducer.");
    expectVerbatim(supporting, items);
  }
});

test("dextroamphetamine's serotonergic warning identifies sertraline through its saved RxClass EPC", async () => {
  const [sertraline] = await loadCabinet("sertraline");
  if (!sertraline) throw new Error("missing sertraline fixture");
  expect(sertraline.ingredients[0]?.classes).toContainEqual({
    id: "N0000175696", name: "Serotonin Reuptake Inhibitor", source: "FDASPL", type: "EPC",
  });
  const owner = labelItem("dextroamphetamine");
  const items = [owner, sertraline];
  const [flag] = interactionFlags(items).filter((candidate) => candidate.itemIds[0] === owner.id);
  expect(flag?.match).toMatchObject({ kind: "class_phrase", text: "serotonergic drugs", ingredient: "sertraline" });
  expect(flag?.severity).toBe("stop");
  expect(flag?.matchedBecause).toMatch(/serotonergic/i);
  expect(flag?.matchedBecause).toMatch(/RxClass/i);
  expect(flag?.matchedBecause).toMatch(/FDASPL|established pharmacologic class|EPC/i);
  expectVerbatim(flag?.quote, items);
});

test("abiraterone reports no clinically meaningful effect from a strong CYP3A4 inhibitor", () => {
  const abiraterone = labelItem("abiraterone");
  expect(interactionFlags([abiraterone, ketoconazole])).toEqual([]);
  expect(interactionFlags([abiraterone, itraconazole])).toEqual([]);
});

test("fidaxomicin permits coadministration with P-gp inhibitors without a dose adjustment", () => {
  expect(interactionFlags([labelItem("fidaxomicin"), verapamil])).toEqual([]);
});

test("a potassium-sparing diuretic warning excludes a thiazide", async () => {
  const drug = oralDrug("82804-972", "hydrochlorothiazide", 25);
  const classes = await fixtureSources().rxNav.getClasses("5487", "ATC");
  expect(classes).toEqual(expect.arrayContaining([expect.objectContaining({ id: "C03AA" })]));
  const other = { ...drug, ingredients: drug.ingredients.map((ingredient) => ({ ...ingredient, classes })) };
  expect(interactionFlags([labelItem("potassiumCitrate"), other])).toEqual([]);
});

test("a combined P-gp and strong CYP3A inhibitor warning requires both properties", () => {
  const owner = labelItem("nubeqa");
  const items = [owner, ketoconazole, verapamil, nefazodone];
  const flags = interactionFlags(items);
  expect(flags.map((flag) => flag.itemIds)).toEqual([[owner.id, ketoconazole.id]]);
  expect(flags[0]?.match?.text).toMatch(/combined P-gp and strong CYP3A inhibitors/i);
  expectVerbatim(flags[0]?.quote, items);
});

test("Gavreto's and/or warning includes drugs that meet either of its two criteria", () => {
  const owner = labelItem("gavreto");
  const flags = interactionFlags([owner, nefazodone, verapamil]);
  expect(flags.map((flag) => [flag.itemIds[1], flag.match?.term])).toEqual([
    [nefazodone.id, "strong CYP3A4 inhibitor"], [verapamil.id, "P-gp inhibitor"],
  ]);
});

test("a combined P-gp and strong CYP3A inducer warning excludes stand-alone CYP3A membership", () => {
  expect(interactionFlags([labelItem("xospata"), labelItem("lysodren")])).toEqual([]);
});

test("the nilotinib class warning matches oral ketoconazole and excludes topical ketoconazole", () => {
  const owner = labelItem("nilotinib");
  const topical = {
    ...ketoconazole, id: "0713-0592", productNdc: "0713-0592", routes: ["TOPICAL"],
    ingredients: [{ name: "ketoconazole", value: 20, unit: "mg", per: { value: 1, unit: "mL" } }],
  };
  expect(interactionFlags([owner, ketoconazole, topical]).map((flag) => flag.itemIds)).toEqual([[owner.id, ketoconazole.id]]);
});

test("a warning restricted to moderate CYP3A inhibitors excludes a strong inhibitor", () => {
  expect(interactionFlags([labelItem("xalkori"), itraconazole])).toEqual([]);
});

test("a contrastive clause retains only the affirmative mechanism warning", () => {
  const owner = {
    ...labelItem("abiraterone"), label: { drug_interactions: [
      "Strong CYP3A4 inhibitors had no effect, but avoid strong CYP3A4 inducers.",
    ] },
  };
  const flags = interactionFlags([owner, itraconazole, rifampin]);
  expect(flags.map((flag) => flag.itemIds)).toEqual([[owner.id, rifampin.id]]);
  expect(flags[0]?.match?.text).toBe("strong CYP3A4 inducers");
});

test.each([
  "Mitotane is a strong CYP3A inducer and may reduce exposure to CYP3A substrates.",
  "Mitotane, a strong CYP3A inducer, may reduce exposure to CYP3A substrates.",
  "Strong CYP3A inducers such as LYSODREN may reduce exposure to CYP3A substrates.",
  "Avoid coadministration of CYP3A substrates with this strong CYP3A inducer.",
])("an inducer describing its own activity keeps other inducers out of the warning: %s", (line) => {
  const owner = { ...labelItem("lysodren"), label: { drug_interactions: [line] } };
  expect(interactionFlags([owner, rifampin])).toEqual([]);
});

test("a named example in an affirmative class warning still allows other class members", () => {
  const owner = { ...labelItem("nilotinib"), label: { drug_interactions: [
    "Avoid strong CYP3A inhibitors such as ketoconazole.",
  ] } };
  expect(interactionFlags([owner, itraconazole])[0]?.match).toMatchObject({ kind: "class_phrase", ingredient: "itraconazole" });
});

test("potassium-related warnings require the relevant established pharmacologic class and salt", () => {
  // The saved NDC bulk snapshot assigns both potassium chloride and potassium fluoride the same EPC.
  const owner = { ...labelItem("potassiumCitrate"), label: { drug_interactions: [
    "Avoid concomitant use with potassium-sparing diuretics or potassium supplements.",
  ] } };
  for (const [member, epc, phrase] of [
    ["amiloride", "Potassium-sparing Diuretic", "potassium-sparing diuretics"],
    ["potassium chloride", "Potassium Salt", "potassium supplements"],
  ] as const) {
    const [flag] = interactionFlags([owner, withClass(member, epc)]);
    expect(flag?.match?.text?.toLowerCase()).toBe(phrase);
    expect(flag?.matchedBecause).toMatch(/RxClass/i);
    expect(flag?.matchedBecause).toContain(epc);
  }
  expect(interactionFlags([owner, withClass("potassium fluoride", "Potassium Salt")])).toEqual([]);
  const salt = withClass("potassium chloride", "Potassium Salt");
  const bowelPreparation = { ...salt, ingredients: [...salt.ingredients, { name: "polyethylene glycol 3350", value: 1, unit: "g" }] };
  expect(interactionFlags([owner, bowelPreparation])).toEqual([]);
});

test.each([
  ["duloxetine", "Serotonin and Norepinephrine Reuptake Inhibitor", "SNRIs"],
  ["duloxetine", "Serotonin and Norepinephrine Reuptake Inhibitor", "serotonergic drugs"],
  ["sumatriptan", "Serotonin-1b and Serotonin-1d Receptor Agonist", "triptans"],
  ["sumatriptan", "Serotonin-1b and Serotonin-1d Receptor Agonist", "serotonergic drugs"],
  ["selegiline", "Monoamine Oxidase Type B Inhibitor", "MAO inhibitors"],
])("%s matches %s through the label phrase %s", (ingredient, epc, phrase) => {
  const owner = { ...labelItem("dextroamphetamine"), label: { drug_interactions: [`Avoid concomitant use with ${phrase}.`] } };
  const [flag] = interactionFlags([owner, withClass(ingredient, epc)]);
  expect(flag?.match).toMatchObject({ kind: "class_phrase", ingredient, text: phrase });
  expect(flag?.matchedBecause).toContain(epc);
  expect(flag?.matchedBecause).toMatch(/RxClass FDASPL/i);
  for (const control of [
    withClass(ingredient, epc, "MESH"), withClass(ingredient, epc, "FDASPL", "MOA"),
    withClass(ingredient, "HMG-CoA Reductase Inhibitor"), withClass(ingredient, "Cytochrome P450 3A Inhibitor"),
  ]) {
    expect(interactionFlags([owner, control])).toEqual([]);
  }
});

test("an OATP1B1 inhibitor warning excludes a transporter substrate", () => {
  const owner = { ...labelItem("abiraterone"), label: { drug_interactions: ["Avoid concomitant use with inhibitors of OATP1B1."] } };
  const cyclosporine = oralDrug("0078-0241", "cyclosporine", 100);
  const pravastatin = oralDrug("71335-9692", "pravastatin", 20);
  const flags = interactionFlags([owner, cyclosporine, pravastatin]);
  expect(flags.map((flag) => flag.itemIds)).toEqual([[owner.id, cyclosporine.id]]);
  expect(flags[0]?.match).toMatchObject({ kind: "class_phrase", term: "OATP1B1 inhibitor" });
  expect(flags[0]?.matchedBecause).toContain("FDA Table 1");
});

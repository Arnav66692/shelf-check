import bisoprolol from "../fixtures/official/openfda-bisoprolol-interactions.json";
import judgeLines from "../fixtures/judge-interaction-lines.json";
import { describe, expect, test } from "vitest";
import { interactionFlags, INTERACTION_SECTIONS, isAboutCoUse } from "../src/flags/interactions.ts";
import type { CabinetItem, Flag } from "../src/types.ts";
import { expectVerbatim, loadCabinet } from "./support/cabinet.ts";

function drug(name: string, atcId?: string): CabinetItem {
  const classes = atcId ? [{ id: atcId, type: "ATC1-4", name: atcId, source: "ATC" }] : [];
  return { id: name, displayName: name, kind: "rx", verified: true, ingredients: [{ name, classes, value: 1, unit: "mg" }] };
}

test("the quoted danger raises an interaction outside a stop section", async () => {
  const clopidogrel = { ...drug("clopidogrel"), label: { drug_interactions: [judgeLines.clopidogrel] } };
  expect(interactionFlags([clopidogrel, drug("omeprazole")])[0]).toMatchObject({
    severity: "stop", quote: { text: judgeLines.clopidogrel },
  });
  const items = await loadCabinet("ibuprofen", "warfarin");
  const [advil] = fromLabelOf(interactionFlags(items), "ibuprofen");
  expect(advil?.severity).toBe("stop");
  expect(advil?.quote?.text).toContain("may cause severe stomach bleeding.");
  expect(advil?.quote?.text).toContain("take a blood thinning");
  expectVerbatim(advil?.quote, items);
});

test("serious interaction wording requires an affirmative danger in the matched clause", async () => {
  const [owner, other] = await loadCabinet("tylenol", "warfarin");
  if (!owner || !other) throw new Error("missing fixtures");
  const run = (text: string) => fromLabelOf(interactionFlags([{ ...owner, label: { drug_interactions: [text] } }, other]), owner.id);
  for (const danger of ["fatal reactions", "death", "respiratory depression", "serotonin syndrome", "serious bleeding"]) {
    expect(run(`Concomitant use with warfarin can cause ${danger}.`)[0]?.severity).toBe("stop");
  }
  for (const line of ["Do not use with warfarin.", "Coadministration with warfarin is contraindicated.",
    "This drug should not be given with warfarin.", "Avoid warfarin to prevent serious bleeding."]) {
    expect(run(line)[0]?.severity).toBe("stop");
  }
  expect(run("There is no evidence of serious bleeding with warfarin.")).toEqual([]);
  expect(run("Concomitant use with warfarin may reduce the risk of death.")).toEqual([]);
  expect(run("Monitor patients taking warfarin, but avoid aspirin.")[0]?.severity).toBe("ask");
  expect(run("Avoid alcohol while taking warfarin.")).toEqual([]);
  expect(run("Avoid driving while taking warfarin.")).toEqual([]);
  expect(run("While taking warfarin, avoid alcohol.")).toEqual([]);
  expect(run("Avoid this medicine while taking warfarin.")[0]?.severity).toBe("stop");
});

test("the generic insulin co-use warning links glargine and lispro only at the standalone insulin mention", () => {
  const owner = { ...drug("semaglutide"), label: { drug_interactions: [judgeLines.ozempic] } };
  expect(interactionFlags([owner, drug("liraglutide", "A10AE")])).toEqual([]);
  for (const [product, atcId] of [[judgeLines.lantus, "A10AE"], [judgeLines.humalog, "A10AB"]] as const) {
    const classes = [{ id: atcId, type: "ATC1-4", name: "Insulins and analogues for injection", source: "ATC" }];
    const other: CabinetItem = { ...product, kind: "rx", verified: true, ingredients: product.ingredients.map((ingredient) => ({ ...ingredient, classes })) };
    expect(interactionFlags([owner, other])[0]).toMatchObject({
      severity: "ask", match: { kind: "class_phrase", term: "insulin", ingredient: product.ingredients[0]?.name },
    });
    for (const qualified of ["an insulin secretagogue", "insulin receptors", "insulin resistance", "endogenous insulin", "insulin detemir"]) {
      const label = { warnings: [`Concomitant use with ${qualified} may increase the risk of hypoglycemia.`] };
      expect(interactionFlags([{ ...owner, label }, other])).toEqual([]);
    }
  }
});

test("an opioid CNS depressant warning catches sleep drugs and sedating antihistamines", async () => {
  const others = await loadCabinet("benadryl", "nyquil", "loratadine", "tylenol");
  const owner = { ...drug("oxycodone"), label: { warnings: [judgeLines.oxycodone] } };
  const items = [owner, drug("zolpidem", "N05CF"), drug("diazepam", "N05BA"), drug("morphine", "N02AA"), ...others];
  const flags = fromLabelOf(interactionFlags(items), owner.id);
  expect(flags.map((flag) => flag.itemIds[1])).toEqual(["zolpidem", "diazepam", "morphine", "benadryl", "nyquil"]);
  for (const flag of flags) {
    expect(flag.severity).toBe("stop");
    expect(flag.quote?.text).toContain("including alcohol");
    expect(flag.quote?.text).toContain("respiratory depression, coma, and death");
    expectVerbatim(flag.quote, items);
  }
  const alcoholOnly = { ...owner, label: { when_using: ["When using this product avoid alcoholic beverages"] } };
  expect(interactionFlags([alcoholOnly, drug("zolpidem", "N05CF")])).toEqual([]);
});

test("Pepto-Bismol links anticoagulation to Eliquis and separates its salicylate co-use bullet from allergy", async () => {
  const [aspirin] = await loadCabinet("aspirin");
  if (!aspirin) throw new Error("missing aspirin fixture");
  const owner = {
    ...drug("bismuth subsalicylate"), displayName: "Pepto-Bismol",
    label: { warnings: [judgeLines.peptoAllergy], ask_doctor_or_pharmacist: [judgeLines.peptoBloodThinner] },
  };
  const eliquis = { ...drug("apixaban", "B01AF"), displayName: "ELIQUIS" };
  const items = [owner, eliquis, aspirin];
  const flags = fromLabelOf(interactionFlags(items), owner.id);
  expect(flags).toHaveLength(2);
  expect(flags[0]?.match).toMatchObject({ kind: "class_phrase", text: "anticoagulation" });
  expect(flags[1]).toMatchObject({ severity: "stop", quote: { text: "taking other salicylate products" } });
  const conditional = { ...owner, label: { warnings: ["Do not take if you are allergic to salicylates and not taking other salicylate products."] } };
  expect(fromLabelOf(interactionFlags([conditional, aspirin]), owner.id)).toEqual([]);
  for (const flag of flags) expectVerbatim(flag.quote, items);
  for (const wording of ["anticoagulant", "thinning the blood", "blood thinner"]) {
    const variant = { ...owner, label: { ask_doctor_or_pharmacist: [`Ask a doctor if you are taking a drug for ${wording}.`] } };
    expect(fromLabelOf(interactionFlags([variant, eliquis]), owner.id)[0]?.match?.text).toBe(wording);
  }
});

test("the class explanation distinguishes Eliquis from the warfarin named on the label", async () => {
  const [tylenol, warfarin] = await loadCabinet("tylenolPm", "warfarin");
  if (!tylenol || !warfarin) throw new Error("missing Tylenol PM or warfarin fixture");
  const eliquis = { ...drug("apixaban", "B01AF"), displayName: "ELIQUIS" };
  const [flag] = fromLabelOf(interactionFlags([tylenol, eliquis]), tylenol.id);
  expect(flag?.match?.kind).toBe("class_phrase");
  expect(flag?.matchedBecause).toBe("ELIQUIS contains apixaban, a blood thinner. The label names warfarin, another blood thinner.");
  const direct = fromLabelOf(interactionFlags([tylenol, warfarin]), tylenol.id);
  expect(direct[0]?.match?.kind).toBe("ingredient_name");
  expect(direct[0]?.matchedBecause).toBeUndefined();
});

test("the Mucinex DM MAOI bullet does not inherit the age restriction from the preceding bullet", () => {
  const mucinex = { ...drug("Mucinex DM"), label: { do_not_use: [judgeLines.mucinexExcerpt] } };
  const items = [mucinex, drug("phenelzine", "N06AF")];
  const [flag] = interactionFlags(items);
  expect(flag).toMatchObject({ severity: "stop", match: { ingredient: "phenelzine" } });
  expect(flag?.quote?.text).toMatch(/^if you are now taking a prescription monoamine oxidase inhibitor/);
  expect(flag?.quote?.text).not.toMatch(/children|under 12/);
  expectVerbatim(flag?.quote, items);
});

function fromLabelOf(flags: readonly Flag[], labelOwnerId: string): readonly Flag[] {
  return flags.filter((flag) => flag.itemIds[0] === labelOwnerId);
}

function searchedText(item: CabinetItem | undefined): string {
  return INTERACTION_SECTIONS.flatMap((section) => item?.label?.[section] ?? []).join(" ");
}

describe("interaction flag", () => {
  test("warfarin plus aspirin: the warfarin label names aspirin in a sentence that is quoted in full", async () => {
    const items = await loadCabinet("warfarin", "aspirin");

    const [flag] = fromLabelOf(interactionFlags(items), "warfarin");

    expect(flag).toMatchObject({ type: "interaction", severity: "ask", itemIds: ["warfarin", "aspirin"] });
    expect(flag?.match).toMatchObject({ kind: "ingredient_name", ingredient: "aspirin" });
    expect(flag?.quote?.section).toBe("drug_interactions");
    expect(flag?.quote?.text).toContain(flag?.match?.text ?? "no match text");
    expect(flag?.quote?.text.toLowerCase()).toContain("aspirin");
    expectVerbatim(flag?.quote, items);
  });

  test("warfarin plus aspirin: the aspirin label is matched through the blood thinner class", async () => {
    const items = await loadCabinet("warfarin", "aspirin");

    const [flag] = fromLabelOf(interactionFlags(items), "aspirin");

    expect(flag?.match).toMatchObject({ kind: "class_phrase", ingredient: "warfarin" });
    expect(flag?.quote?.text).toContain("take a blood thinning (anticoagulant) or steroid drug");
    expectVerbatim(flag?.quote, items);
  });

  test("lisinopril plus ibuprofen is found through the NSAID class phrase, not the drug name", async () => {
    const items = await loadCabinet("lisinoprilHctz", "ibuprofen");
    const lisinopril = items.find((item) => item.id === "lisinoprilHctz");

    const flags = fromLabelOf(interactionFlags(items), "lisinoprilHctz");

    expect(searchedText(lisinopril).toLowerCase()).not.toContain("ibuprofen");
    expect(flags).toHaveLength(1);
    expect(flags[0]?.match).toMatchObject({ kind: "class_phrase", term: "NSAID", ingredient: "ibuprofen" });
    expect(flags[0]?.quote?.text).toContain("co-administration of NSAIDs");
    expect(flags[0]?.quote?.text).toContain(flags[0]?.match?.text ?? "no match text");
    expectVerbatim(flags[0]?.quote, items);
  });

  test("a pair gives at most one flag per label section", async () => {
    const items = await loadCabinet("ibuprofen", "aspirin");

    const flags = fromLabelOf(interactionFlags(items), "ibuprofen");
    const sections = flags.map((flag) => flag.quote?.section);

    expect(sections).toEqual(["warnings", "ask_doctor_or_pharmacist"]);
    expect(new Set(sections).size).toBe(sections.length);
  });

  test("text that an OTC label repeats inside Warnings is reported once, under its own section", async () => {
    const items = await loadCabinet("tylenol", "warfarin");

    const flags = fromLabelOf(interactionFlags(items), "tylenol");

    expect(flags).toHaveLength(1);
    expect(flags[0]?.quote).toEqual({
      text: "Ask a doctor or pharmacist before use if you are taking the blood thinning drug warfarin",
      excerpt: "Ask a doctor or pharmacist before use if you are taking the blood thinning drug warfarin",
      itemId: "tylenol",
      section: "ask_doctor_or_pharmacist",
    });
  });

  test("a sentence about being allergic to a drug is not treated as an interaction", async () => {
    const items = await loadCabinet("ibuprofen", "aspirin");

    const flags = fromLabelOf(interactionFlags(items), "ibuprofen");

    expect(flags.some((flag) => /allergic/i.test(flag.quote?.text ?? ""))).toBe(false);
  });

  test("a shared ingredient is left to the duplicate flag", async () => {
    const items = await loadCabinet("tylenol", "nyquil");

    expect(interactionFlags(items)).toEqual([]);
  });

  test("lisinopril plus loratadine: antihistamines named as a treatment for swelling are not an interaction", async () => {
    const items = await loadCabinet("lisinoprilHctz", "loratadine");
    const lisinopril = items.find((item) => item.id === "lisinoprilHctz");

    expect(searchedText(lisinopril)).toContain("treatment with antihistamines and corticosteroids may not be sufficient");
    expect(interactionFlags(items)).toEqual([]);
  });

  test("lisinopril gives no flag against any antihistamine product, by class name or class phrase", async () => {
    const items = await loadCabinet("lisinoprilHctz", "loratadine", "benadryl", "nyquil", "tylenolPm");

    expect(fromLabelOf(interactionFlags(items), "lisinoprilHctz")).toEqual([]);
  });

  test("a group word counts in an interaction section or next to co-use wording, and nowhere else", () => {
    const treatment = "Symptoms have not been relieved by antihistamines in these situations.";

    expect(isAboutCoUse({ section: "warnings", text: treatment })).toBe(false);
    expect(isAboutCoUse({ section: "drug_interactions", text: treatment })).toBe(true);
    expect(isAboutCoUse({ section: "ask_doctor_or_pharmacist", text: "sedatives or tranquilizers" })).toBe(true);
    expect(isAboutCoUse({ section: "warnings", text: "take a blood thinning (anticoagulant) or steroid drug" })).toBe(true);
    expect(isAboutCoUse({ section: "warnings", text: "Concomitant use of NSAIDs raises the risk." })).toBe(true);
    expect(isAboutCoUse({ section: "when_using", text: "alcohol, sedatives, and tranquilizers may increase drowsiness" })).toBe(true);
  });

  test("NyQuil plus Benadryl: each label's sedatives line is matched through RxClass membership", async () => {
    const items = await loadCabinet("nyquil", "benadryl");

    const flags = interactionFlags(items);
    const [fromNyquil] = fromLabelOf(flags, "nyquil");
    const [fromBenadryl] = fromLabelOf(flags, "benadryl");

    expect(fromNyquil?.match).toMatchObject({ kind: "class_phrase", term: "sedative", ingredient: "diphenhydramine" });
    expect(fromNyquil?.quote?.section).toBe("ask_doctor_or_pharmacist");
    expect(fromNyquil?.quote?.text).toContain("taking sedatives or tranquilizers");
    expect(fromBenadryl?.match).toMatchObject({ kind: "class_phrase", term: "sedative", ingredient: "doxylamine" });
    expect(fromBenadryl?.quote?.text).toContain("taking sedatives or tranquilizers");
    for (const flag of flags) expectVerbatim(flag.quote, items);
  });

  test("the sedative match comes from the ATC subgroup of each antihistamine, so loratadine is not matched", async () => {
    const items = await loadCabinet("nyquil", "benadryl", "loratadine");
    const classIds = (id: string): readonly string[] =>
      items.find((item) => item.id === id)?.ingredients.flatMap((ingredient) => (ingredient.classes ?? []).map((c) => c.id)) ?? [];

    expect(classIds("benadryl")).toContain("R06AA");
    expect(classIds("nyquil")).toContain("R06AA");
    expect(classIds("loratadine")).toEqual(["R06AX"]);
    expect(interactionFlags(items).some((flag) => flag.itemIds.includes("loratadine"))).toBe(false);
  });

  test("loratadine plus Tylenol gives no interaction flag", async () => {
    const items = await loadCabinet("loratadine", "tylenol");

    expect(interactionFlags(items)).toEqual([]);
  });
});

test("requires affirmative co-use evidence in the clause naming the other drug", async () => {
  const [owner, aspirin] = await loadCabinet("warfarin", "aspirin");
  if (!owner || !aspirin) throw new Error("missing fixtures");
  const cimetidine: CabinetItem = { ...aspirin, id: "cimetidine", ingredients: [{ name: "cimetidine", value: 200, unit: "mg" }] };
  const negative = bisoprolol.drug_interactions.join(" ");
  expect(negative).toContain("no clinically relevant interactions");
  const run = (line: string, other: CabinetItem) => fromLabelOf(interactionFlags([
    { ...owner, label: { drug_interactions: [line] } }, other,
  ]), owner.id);
  expect(run(negative, cimetidine)).toEqual([]);
  expect(run("No interaction with cimetidine, but avoid concomitant use with aspirin.", cimetidine)).toEqual([]);
  expect(run("Patients allergic to aspirin may have a rash, but avoid concomitant use with cimetidine.", cimetidine)).toHaveLength(1);
  expect(run("Patients allergic to aspirin may have a rash, but avoid concomitant use with cimetidine.", aspirin)).toEqual([]);
  expect(run("Cimetidine was included in this study.", cimetidine)).toEqual([]);
  expect(run("An interaction with cimetidine has not been established.", cimetidine)).toEqual([]);
  expect(run("Co-administration with cimetidine is not contraindicated.", cimetidine)).toEqual([]);
  expect(run("Avoid acid reducers other than cimetidine.", cimetidine)).toEqual([]);
  expect(run("Cimetidine increased the risk of dizziness when administered alone.", cimetidine)).toEqual([]);
  expect(run("If anticoagulation is needed, avoid aspirin rather than cimetidine.", cimetidine)).toEqual([]);
  expect(run("Do not use with cimetidine.", cimetidine)).toHaveLength(1);
});

test("a serotonin syndrome warning that says the risk is increased with St. John's Wort is caught", () => {
  const warning = "Serotonin syndrome has been reported with SSRIs, a potentially life-threatening condition. The risk is increased with concomitant use of other serotonergic drugs (including triptans, tricyclic antidepressants, fentanyl, lithium, tramadol, meperidine, methadone, tryptophan, buspirone, amphetamines, and St. John’s Wort) and with drugs that impair metabolism of serotonin.";
  const sertraline = { ...drug("sertraline"), label: { warnings_and_cautions: [warning] } };
  const [flag] = fromLabelOf(interactionFlags([sertraline, drug("St. John's Wort")]), "sertraline");
  expect(flag?.severity).toBe("stop");
  expect(flag?.quote?.text).toContain("St. John’s Wort");
  expect(flag?.quote?.text).toContain("Serotonin syndrome");
  const reassured = { ...sertraline, label: { warnings_and_cautions: ["The risk is increased with concomitant use of other serotonergic drugs, but no interaction was seen with St. John’s Wort."] } };
  expect(fromLabelOf(interactionFlags([reassured, drug("St. John's Wort")]), "sertraline")).toHaveLength(0);
});

test("an Examples line and a bulleted list are read with the warning sentence before them", () => {
  const pill = { ...drug("levonorgestrel"), label: { drug_interactions: [
    "Contraceptive effectiveness may be reduced when hormonal contraceptives are coadministered with antibiotics. This could result in unintended pregnancy or unscheduled bleeding. Examples include rifampin, rifabutin, barbiturates, and carbamazepine.",
  ] } };
  const [flag] = fromLabelOf(interactionFlags([pill, drug("rifampin")]), "levonorgestrel");
  expect(flag).toMatchObject({ severity: "stop" });
  expect(flag?.quote?.text).toContain("unintended pregnancy");
  expect(flag?.quote?.text).toContain("Examples include rifampin");

  const methotrexate = { ...drug("methotrexate"), label: { drug_interactions: [
    "If coadministration cannot be avoided, monitor closely for methotrexate adverse reactions when coadministered with: • Oral antibiotics • Aspirin and other nonsteroidal anti-inflammatory drugs • Hepatotoxic products",
  ] } };
  const [mtx] = fromLabelOf(interactionFlags([methotrexate, drug("aspirin")]), "methotrexate");
  expect(mtx?.quote?.text).toContain("when coadministered with: Aspirin");
  expect(fromLabelOf(interactionFlags([{ ...methotrexate, label: { drug_interactions: ["The following were studied: • aspirin"] } }, drug("aspirin")]), "methotrexate")).toEqual([]);
});

test("label wording for statin muscle damage, dose caps and spacing counts as a warning", () => {
  const owner = (text: string) => ({ ...drug("fluconazole"), label: { drug_interactions: [text] } });
  const run = (text: string, other: string) => fromLabelOf(interactionFlags([owner(text), drug(other)]), "fluconazole");
  expect(run("The risk of myopathy and rhabdomyolysis increases when fluconazole is coadministered with statins, such as atorvastatin.", "atorvastatin")[0]?.severity).toBe("stop");
  expect(run("For patients taking verapamil or diltiazem, do not exceed fluconazole 10 mg daily.", "diltiazem")).toHaveLength(1);
  expect(run("Phosphate binders (e.g., calcium carbonate) may bind to fluconazole. Administer fluconazole at least 4 hours apart from these agents.", "calcium carbonate")[0]?.quote?.text).toContain("4 hours apart");
});

test("a label that exempts one member of a warned group by name gives a note, not an alarm", () => {
  const eliquis = { ...drug("apixaban"), label: { drug_interactions: [
    "Avoid coadministration with combined P-gp and strong CYP3A4 inhibitors. Although clarithromycin is a combined P-gp and strong CYP3A4 inhibitor, pharmacokinetic data suggest that no dose adjustment is necessary with concomitant administration.",
  ] } };
  const flags = fromLabelOf(interactionFlags([eliquis, drug("clarithromycin")]), "apixaban");
  expect(flags.every((flag) => flag.severity !== "stop")).toBe(true);
});

test("an eye or skin product does not carry its drug group's systemic interactions, and furosemide is not a sulfa antibiotic", () => {
  const simvastatin = { ...drug("simvastatin"), label: { contraindications: ["Concomitant use of strong CYP3A4 inhibitors (select azole anti-fungals, macrolide antibiotics) is contraindicated."] } };
  const ointment: CabinetItem = { ...drug("erythromycin", "J01FA"), routes: ["OPHTHALMIC"] };
  expect(fromLabelOf(interactionFlags([simvastatin, ointment]), "simvastatin")).toEqual([]);
  const bactrim = { ...drug("sulfamethoxazole"), label: { drug_interactions: ["Sulfonamides can also displace methotrexate; avoid concurrent use."] } };
  const furosemide: CabinetItem = { ...drug("furosemide"), ingredients: [{ name: "furosemide", value: 20, unit: "mg", classes: [{ id: "C03CA", type: "ATC1-4", name: "Sulfonamides, plain", source: "ATC" }] }] };
  expect(fromLabelOf(interactionFlags([bactrim, furosemide]), "sulfamethoxazole")).toEqual([]);
});

test("a changed blood thinner effect, raised lithium levels and bone marrow suppression are serious", () => {
  const run = (owner: string, text: string, other: string) =>
    fromLabelOf(interactionFlags([{ ...drug(owner), label: { drug_interactions: [text] } }, drug(other)]), owner)[0]?.severity;
  expect(run("metronidazole", "Metronidazole has been reported to potentiate the anticoagulant effect of warfarin.", "warfarin")).toBe("stop");
  expect(run("lithium", "Diuretics or ibuprofen may increase lithium serum concentrations.", "ibuprofen")).toBe("stop");
  expect(run("allopurinol", "Concomitant use with azathioprine may increase the risk of adverse reactions, including myelosuppression.", "azathioprine")).toBe("stop");
  expect(run("lithium", "Lithium levels should be closely monitored when patients start or stop ibuprofen use with lithium.", "ibuprofen")).toBe("ask");
  expect(run("lisinopril", "Lithium: Symptoms of lithium toxicity (7.5). NSAIDs: increased risk of renal impairment with ibuprofen.", "ibuprofen")).not.toBe("stop");
});

test("a nitrate is matched to a label that warns about nitrates or nitric oxide donors, even without a drug class", () => {
  const viagra = { ...drug("sildenafil"), label: { contraindications: ["Administration of VIAGRA to patients using nitric oxide donors, such as organic nitrates or organic nitrites in any form is contraindicated."] } };
  expect(fromLabelOf(interactionFlags([viagra, drug("isosorbide")]), "sildenafil")[0]?.severity).toBe("stop");
});

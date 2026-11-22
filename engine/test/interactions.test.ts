import bisoprolol from "../fixtures/official/openfda-bisoprolol-interactions.json";
import { describe, expect, test } from "vitest";
import { interactionFlags, INTERACTION_SECTIONS, isAboutCoUse } from "../src/flags/interactions.ts";
import type { CabinetItem, Flag } from "../src/types.ts";
import { expectVerbatim, loadCabinet } from "./support/cabinet.ts";

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

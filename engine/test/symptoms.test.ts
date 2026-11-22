import { describe, expect, test } from "vitest";
import emergencyPhrases from "../fixtures/emergency-phrases.json";
import { isEmergency, matchSymptoms, RED_FLAG_SYMPTOMS, screenEmergency, symptomsMentioned } from "../src/symptoms.ts";
import { expectVerbatim, loadCabinet } from "./support/cabinet.ts";

const WHOLE_CABINET = ["tylenol", "nyquil", "benadryl", "tylenolPm", "aspirin", "ibuprofen", "loratadine", "warfarin"] as const;

describe("matchSymptoms", () => {
  test("a runny nose and cough points to the cold and allergy products, not the pain relievers", async () => {
    const items = await loadCabinet(...WHOLE_CABINET);

    const matches = matchSymptoms("I have a runny nose and a cough", items);

    expect(matches.map((match) => match.item.id)).toEqual(["nyquil", "benadryl", "loratadine"]);
    expect(matches[0]?.symptoms).toEqual(["cough", "runny nose"]);
  });

  test("each match quotes the Uses text of that product word for word", async () => {
    const items = await loadCabinet(...WHOLE_CABINET);

    const matches = matchSymptoms("bad headache", items);

    expect(matches.map((match) => match.item.id)).toEqual(["tylenol", "nyquil", "tylenolPm", "aspirin", "ibuprofen"]);
    for (const match of matches) {
      expect(match.quote.section).toBe("indications_and_usage");
      expect(match.quote.text.toLowerCase()).toContain("headache");
      expectVerbatim(match.quote, items);
    }
  });

  test("everyday wording is mapped to label wording", async () => {
    const items = await loadCabinet(...WHOLE_CABINET);

    expect(symptomsMentioned("my nose is so stuffy, stuffy nose all day")).toEqual(["nasal congestion"]);
    expect(matchSymptoms("I can’t sleep", items).map((match) => match.item.id)).toEqual(["tylenolPm"]);
    expect(matchSymptoms("hay fever", items).map((match) => match.item.id)).toEqual(["benadryl", "loratadine"]);
  });

  test("a fever does not match a product that only lists hay fever", async () => {
    const items = await loadCabinet(...WHOLE_CABINET);

    const ids = matchSymptoms("I have a fever", items).map((match) => match.item.id);

    expect(ids).toEqual(["tylenol", "nyquil", "aspirin", "ibuprofen"]);
  });

  test("returns nothing when no product in the cabinet lists the symptom", async () => {
    const items = await loadCabinet(...WHOLE_CABINET);

    expect(matchSymptoms("stuffy nose", items)).toEqual([]);
    expect(matchSymptoms("heartburn after dinner", items)).toEqual([]);
    expect(matchSymptoms("what is the weather", items)).toEqual([]);
  });
});

describe("isEmergency", () => {
  test.each(emergencyPhrases)("routes the judge's phrase \"$text\" to $reason before product matching", async ({ text, reason }) => {
    const items = await loadCabinet("tylenol", "ibuprofen", "warfarin");
    expect(screenEmergency(text)).toEqual({
      emergency: true, reason, poison: reason === "poison", selfHarm: reason === "self_harm",
    });
    expect(isEmergency(text)).toBe(true);
    expect(matchSymptoms(text, items)).toEqual([]);
  });

  test("marks both poison exposure and self-harm when both are reported", () => {
    expect(screenEmergency("I want to die. I overdosed.")).toMatchObject({ reason: "poison", poison: true, selfHarm: true });
    expect(screenEmergency("I was poisoned")).toMatchObject({ reason: "poison" });
    expect(screenEmergency("My toddler ate a pill")).toMatchObject({ reason: "poison" });
    expect(screenEmergency("My toddler drank a bottle of cough syrup")).toMatchObject({ reason: "poison" });
    expect(screenEmergency("My toddler swallowed grandma’s Tylenol")).toMatchObject({ reason: "poison" });
    expect(screenEmergency("I have difficulty swallowing pills")).toEqual({ emergency: false });
    expect(screenEmergency("I don't want to die")).toEqual({ emergency: false });
  });

  test("routes fever with a confirmed age under three months before matching fever products", async () => {
    const items = await loadCabinet("tylenol");
    expect(screenEmergency("fever", { ageMonths: 2 })).toMatchObject({ reason: "infant_fever" });
    expect(matchSymptoms("fever", items, { ageMonths: 2 })).toEqual([]);
    expect(isEmergency("fever", { ageMonths: 3 })).toBe(false);
    expect(isEmergency("my 6-week-old has no fever")).toBe(false);
    expect(isEmergency("my 6-month-old has a fever")).toBe(false);
    expect(isEmergency("My baby has a fever and is only 6 weeks old")).toBe(true);
    expect(isEmergency("My baby is 6 weeks old. She has a fever.")).toBe(true);
    expect(isEmergency("My baby is 6 weeks old. She has no fever.")).toBe(false);
    expect(isEmergency("My baby is 6 weeks old. I have a fever.")).toBe(false);
  });

  test.each([
    "I have chest pain and my arm hurts",
    "She has trouble breathing",
    "I can’t breathe",
    "his face drooping on one side, slurred speech",
    "this is the WORST headache of my life",
    "I think I took an overdose",
    "I keep having suicidal thoughts",
    "he was coughing blood this morning",
    "severe allergic reaction after the shot",
    "fainting when I stand up",
  ])("treats %j as an emergency", (text) => {
    expect(isEmergency(text)).toBe(true);
  });

  test.each(["I have a headache", "runny nose and cough", "my chest feels fine and the pain is in my knee", ""])(
    "does not treat %j as an emergency",
    (text) => {
      expect(isEmergency(text)).toBe(false);
    },
  );

  test("lists every phrase the brief asked for", () => {
    expect(RED_FLAG_SYMPTOMS).toEqual(
      expect.arrayContaining([
        "chest pain",
        "trouble breathing",
        "face drooping",
        "slurred speech",
        "severe allergic reaction",
        "overdose",
        "suicidal thoughts",
        "worst headache of my life",
        "fainting",
        "coughing blood",
      ]),
    );
  });
});

test("screens every word for red flags before matching cabinet products", async () => {
  const items = await loadCabinet("nyquil");
  const prefix = "I have a cough. " + "I am writing this down. ".repeat(30);
  expect(isEmergency(prefix + "shortness of\nbreath")).toBe(true);
  for (const phrase of [
    "shortness of breath", "can't breathe", "trouble breathing", "chest pressure",
    "face drooping", "slurred speech", "worst headache", "suicidal", "overdose",
    "unconscious", "seizure", "coughing up blood", "vomiting blood", "severe bleeding",
    "anaphylaxis", "throat swelling",
  ]) {
    expect(isEmergency(prefix + phrase), phrase).toBe(true);
    expect(matchSymptoms(prefix + phrase, items), phrase).toEqual([]);
  }
});

test("uses only affirmed symptoms and retains uncertain emergency mentions", async () => {
  const items = await loadCabinet("tylenol", "nyquil");
  expect(matchSymptoms("I have no fever or headache, only a rash", items)).toEqual([]);
  expect(isEmergency("No chest pain, just a headache")).toBe(false);
  expect(symptomsMentioned("I don't have a fever but I have a headache")).toEqual(["headache"]);
  expect(isEmergency("No chest pain earlier but I have chest pain now")).toBe(true);
  expect(isEmergency("No cough, I am not sure if this is chest pressure")).toBe(true);
  expect(isEmergency("I can't rule out a seizure")).toBe(true);
  expect(isEmergency("No, chest pain")).toBe(true);
  expect(isEmergency("I do not have no chest pressure")).toBe(true);
  expect(isEmergency("No chest pain?")).toBe(true);
  expect(isEmergency("No chest pain relief from a cough medicine")).toBe(true);
  expect(isEmergency("I can't say no chest pain")).toBe(true);
  expect(symptomsMentioned("I am fever-free")).toEqual([]);
  expect(symptomsMentioned("Maybe fever or headache")).toEqual([]);
  const [tylenol] = items;
  if (!tylenol) throw new Error("missing fixture");
  expect(matchSymptoms("headache", [{ ...tylenol, label: { indications_and_usage: ["For fever but not for headache."] } }])).toEqual([]);
});

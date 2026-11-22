import { describe, expect, test } from "vitest";
import { isEmergency, matchSymptoms, RED_FLAG_SYMPTOMS, symptomsMentioned } from "../src/symptoms.ts";
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

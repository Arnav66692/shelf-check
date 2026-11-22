import { describe, expect, test } from "vitest";
import emergencyPhrases from "../fixtures/emergency-phrases.json";
import { isEmergency, matchSymptoms, RED_FLAG_SYMPTOMS, screenEmergency, symptomsMentioned } from "../src/symptoms.ts";
import { expectVerbatim, loadCabinet } from "./support/cabinet.ts";
import type { CabinetItem } from "../src/types.ts";

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

test("round 2 plain-language emergencies are caught", () => {
  const cases: [string, boolean][] = [
    ["my husband is very sleepy and his breathing is slow after his pain pills", true],
    ["he won't wake up", true],
    ["my son got into the medicine cabinet", true],
    ["toddler ate a gummy vitamin bottle", true],
    ["I took a double dose of my blood thinner", true],
    ["I took my pills twice by mistake", true],
    ["my face is drooping and I can't talk right", false],
    ["one side of my body is weak", false],
    ["I can't feel my left arm", false],
    ["my throat is closing", false],
    ["I have hives all over and feel dizzy after amoxicillin", false],
    ["my lips are blue", false],
    ["I don't want to be here anymore", false],
    ["I've been thinking about ending it", false],
    ["my poop is black", false],
    ["I'm bleeding and it won't stop", false],
    ["my nosebleed won't stop on warfarin", false],
    ["I fell and hit my head on warfarin", false],
  ];
  for (const [text, poison] of cases) {
    const screen = screenEmergency(text);
    expect(screen.emergency, text).toBe(true);
    if (screen.emergency && poison) expect(screen.poison, text).toBe(true);
  }
  expect(screenEmergency("I don't want to be here anymore")).toMatchObject({ emergency: true, selfHarm: true });
  expect(screenEmergency("headache and a stuffy nose").emergency).toBe(false);
});

test("round 3 plain-language emergencies are caught", () => {
  const cases: [string, "poison" | "selfHarm" | "911"][] = [
    ["my dad is snoring weird and i cant wake him he took his pain meds and xanax", "poison"],
    ["took like 20 tylenol an hour ago but i feel fine", "poison"],
    ["my teen took a bunch of her adhd pills", "poison"],
    ["accidentally took my wife's pills instead of mine", "poison"],
    ["i have pills saved up to end it", "selfHarm"],
    ["everyone would be better off without me", "selfHarm"],
    ["my mouth is drooping on one side", "911"],
    ["threw up something that looks like coffee grounds", "911"],
    ["peeing blood and i take eliquis", "911"],
    ["severe muscle pain and my pee is dark brown on my statin", "911"],
    ["hot, confused, twitching, and shivering after starting tramadol with my zoloft", "911"],
    ["my heart is beating super slow and i feel faint on my digoxin", "911"],
  ];
  for (const [text, kind] of cases) {
    const screen = screenEmergency(text);
    expect(screen.emergency, text).toBe(true);
    if (screen.emergency && kind === "poison") expect(screen.poison, text).toBe(true);
    if (screen.emergency && kind === "selfHarm") expect(screen.selfHarm, text).toBe(true);
  }
  for (const ordinary of ["i took 2 advil for my headache", "my back hurts after the gym", "my nose is runny and i have a sore throat", "took my 10 mg pill this morning"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

test("round 4 plain-language emergencies are caught", () => {
  const cases: [string, "poison" | "selfHarm" | "911"][] = [
    ["found my toddler chewing on a fentanyl patch", "poison"],
    ["my husband is turning blue and making gurgling sounds", "911"],
    ["my child drank lamp oil", "poison"],
    ["my kid swallowed a magnet", "poison"],
    ["my grandma took her blood pressure pill 3 times today by mistake", "poison"],
    ["my left side went numb and my words are coming out wrong", "911"],
    ["sudden blurry vision in one eye and my arm feels weak", "911"],
    ["my eyes and lips swelled up after the antibiotic", "911"],
    ["throat feels tight and itchy after taking bactrim", "911"],
    ["my skin is peeling and blistering after starting lamotrigine", "911"],
    ["heart pounding, sweating and my jaw hurts", "911"],
    ["bad headache, stiff neck and a high fever", "911"],
    ["im pregnant and have a bad headache and seeing spots", "911"],
    ["high fever and my muscles are stiff after starting haloperidol", "911"],
    ["im on lithium and im shaking, throwing up and confused", "911"],
    ["bad stomach pain and yellow eyes after taking a lot of tylenol this week", "911"],
    ["my blood sugar is 40 and im shaky and sweaty", "911"],
    ["took 2 ambien with some drinks and i can barely keep my eyes open", "poison"],
    ["my erection has lasted 5 hours after the viagra", "911"],
    ["my dad took a whole bottle of his pills", "poison"],
    ["took double my insulin", "poison"],
    ["I gave my baby two doses of tylenol by mistake", "poison"],
    ["i took 30 advil so i can sleep forever", "selfHarm"],
    ["i want to overdose", "selfHarm"],
  ];
  for (const [text, kind] of cases) {
    const screen = screenEmergency(text);
    expect(screen.emergency, text).toBe(true);
    if (screen.emergency && kind === "poison") expect(screen.poison, text).toBe(true);
    if (screen.emergency && kind === "selfHarm") expect(screen.selfHarm, text).toBe(true);
  }
  for (const ordinary of ["I cant breathe through my nose", "this headache is killing me", "my jaw hurts from chewing gum", "my blood sugar is 140 after lunch", "sore muscles after the gym", "i took my 2 vitamins this morning"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

test("round 5 plain-language emergencies are caught", () => {
  const cases: [string, "poison" | "selfHarm" | "911"][] = [
    ["my 3 year old got into grandmas pill box, not sure what she ate", "poison"],
    ["my friend took xanax and is breathing really slow", "poison"],
    ["i dont want to be alive anymore", "selfHarm"],
    ["thinking about taking all my pills tonight", "selfHarm"],
    ["my toddler drank some windshield washer fluid", "poison"],
    ["my 4 year old swallowed some of my clonidine", "poison"],
    ["hives everywhere and my throat feels weird after the shot", "911"],
    ["i injected my insulin twice and now im sweaty and confused", "poison"],
    ["my heart rate is over 180 and i feel faint", "911"],
    ["my teenager took something at a party and is burning hot and acting crazy", "poison"],
    ["i suddenly cant move my legs", "911"],
    ["i am throwing up blood", "911"],
    ["my husband is gray and sweaty and says his chest feels heavy", "911"],
    ["cant stop shaking and my heart is going crazy after my adderall and a preworkout", "911"],
  ];
  for (const [text, kind] of cases) {
    const screen = screenEmergency(text);
    expect(screen.emergency, text).toBe(true);
    if (screen.emergency && kind === "poison") expect(screen.poison, text).toBe(true);
    if (screen.emergency && kind === "selfHarm") expect(screen.selfHarm, text).toBe(true);
  }
  for (const ordinary of ["my nose is so stuffy i cant breathe through it at night", "took my vitamin d twice", "my son ate a lot of candy", "my heart rate is 72"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

test("round 5 red flags for children and breathing are caught", () => {
  for (const text of [
    "fever of 104 and she is very hard to wake up",
    "my son has a fever and a stiff neck",
    "fever and a purple rash that does not fade",
    "she has a fever and is not drinking and has not peed all day",
    "my baby is breathing fast and her lips look blue",
  ]) expect(screenEmergency(text).emergency, text).toBe(true);
  for (const ordinary of ["my 4 year old has a fever and a cough", "runny nose and a mild headache", "heartburn after dinner", "my neck is a bit stiff from sleeping wrong"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

test("a stiff neck or a limp alone is not an emergency", () => {
  for (const ordinary of ["i have a stiff neck from sleeping on the couch", "i have a limp since my ankle sprain"]) expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
});

test("everyday complaints match the label's Uses line, and an if in a label is not doubt", () => {
  const item = (id: string, uses: string): CabinetItem => ({ id, displayName: id, kind: "otc", verified: true, ingredients: [{ name: id, value: 1, unit: "mg" }], label: { indications_and_usage: [uses] } });
  const zzz = item("zzzquil", "Uses helps you fall asleep if you have occasional sleeplessness");
  const pepto = item("pepto", "Uses relieves travelers' diarrhea, diarrhea, upset stomach due to overindulgence in food and drink, including heartburn, indigestion, nausea");
  const advil = item("advil", "Uses temporarily relieves minor aches and pains due to headache, toothache, backache, menstrual cramps, the common cold");
  expect(matchSymptoms("I cant sleep", [zzz]).map((match) => match.item.id)).toEqual(["zzzquil"]);
  expect(matchSymptoms("stomach ache", [pepto, advil]).map((match) => match.item.id)).toEqual(["pepto"]);
  expect(matchSymptoms("i have a cold", [advil]).map((match) => match.item.id)).toEqual(["advil"]);
  expect(matchSymptoms("menstrual cramps", [advil, pepto]).map((match) => match.item.id)).toEqual(["advil"]);
});

test("round 6 red flags in other word orders are caught", () => {
  for (const text of [
    "his lips look a bit blue", "her lips look a little blue", "my throat feels like it is closing",
    "rash that doesnt go away when i press a glass on it", "sudden weakness on one side",
    "her arm went numb and her face looks uneven", "he cant lift his left arm", "he is confused and very dizzy after starting his new pill",
  ]) expect(screenEmergency(text).emergency, text).toBe(true);
  for (const ordinary of ["my face is a bit red from the sun", "my leg is sore from running", "i got a rash from a new soap", "my lips are chapped"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

test("round 8 slang emergencies are caught", () => {
  for (const text of [
    "honestly dont see the point anymore, thinking bout taking all my pills",
    "found the baby chewing on the tylenol bottle, cap was off",
    "seizing and it wont stop been 6 min",
    "took my tramadol and a bunch of beers, breathing real slow now",
    "pooping black tarry stuff since yesterday and dizzy af",
  ]) expect(screenEmergency(text).emergency, text).toBe(true);
  for (const ordinary of ["my baby is chewing on everything, teething", "i have a cold and a cough", "my 2yo has a cough and runny nose"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

test("round 7 judge's missed emergencies are caught", () => {
  for (const text of [
    "she is seizing", "my kid is having a fit", "he wont stop shaking and isnt responding", "kms", "i wanna kms",
    "blue around her mouth", "blue around her mouth and shes super pale", "she is very pale and blue",
    "drank a bottle of nyquil", "i drank half a bottle of nyquil", "her stool is black like tar", "pooping blood",
    "nosebleed that wont stop", "i cant stop bleeding",
    "chest is crushing and it goes down my left arm", "my kid is shaking all over and wont stop, like a fit",
  ]) expect(screenEmergency(text).emergency, text).toBe(true);
  expect(screenEmergency("kms").selfHarm).toBe(true);
  for (const ordinary of ["my kid had a fit about bedtime", "i drank a bottle of water", "she is pale and tired", "my nose bled a little this morning"]) {
    expect(screenEmergency(ordinary).emergency, ordinary).toBe(false);
  }
});

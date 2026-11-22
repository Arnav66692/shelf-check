import { describe, expect, test } from "vitest";
import { splitSentences, termRegExp } from "../src/text.ts";

describe("splitSentences", () => {
  test("returns exact pieces of the original text", () => {
    const text = "Do not use with warfarin. Ask a doctor (see section 5.1). Stop use if bleeding occurs.";

    const sentences = splitSentences(text);

    expect(sentences).toEqual([
      "Do not use with warfarin.",
      "Ask a doctor (see section 5.1).",
      "Stop use if bleeding occurs.",
    ]);
    for (const sentence of sentences) expect(text).toContain(sentence);
  });

  test("treats label bullets as boundaries", () => {
    expect(splitSentences("Directions • take only as directed • do not exceed 4 doses per 24 hrs")).toEqual([
      "Directions",
      "take only as directed",
      "do not exceed 4 doses per 24 hrs",
    ]);
  });

  test("does not cut after an abbreviation or inside a decimal", () => {
    expect(splitSentences("Avoid St. John's wort with 2.5 mg tablets. Tell your doctor.")).toEqual([
      "Avoid St. John's wort with 2.5 mg tablets.",
      "Tell your doctor.",
    ]);
  });

  test("does not cut after an abbreviation that opens a quotation", () => {
    expect(splitSentences('The label names "St. John’s wort" in this line. Ask a doctor.')).toEqual([
      'The label names "St. John’s wort" in this line.',
      "Ask a doctor.",
    ]);
  });
});

describe("termRegExp", () => {
  test.each([
    ["non-steroidal anti-inflammatory", "Non-steroidal Anti-Inflammatory Agents"],
    ["non-steroidal anti-inflammatory", "nonsteroidal anti-inflammatory drugs"],
    ["NSAID", "co-administration of NSAIDs, including"],
    ["Vitamin K antagonists", "a vitamin K antagonist such as"],
    ["blood thinner", "taking blood thinners"],
    ["St. John's wort", "co-enzyme Q 10 , St. John’s wort, ginseng"],
    ["St. John's wort", "buspirone, and St. John's Wort) and with drugs"],
    ["anti-coagulant", "anticoagulant, antiplatelet, and/or fibrinolytic"],
    ["anti-coagulant", "may potentiate anti-coagulant/anti-platelet agents"],
  ])("%j matches %j", (term, text) => {
    expect(termRegExp(term).test(text)).toBe(true);
  });

  test.each([
    ["steroid drug", "non-steroidal drugs"],
    ["aspirin", "aspirinlike"],
    ["MAOI", "maoist"],
  ])("%j does not match inside another word in %j", (term, text) => {
    expect(termRegExp(term).test(text)).toBe(false);
  });
});

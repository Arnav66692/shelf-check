import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { buildLesson, MAX_QUOTES } from "./lesson.ts";
import { cleanLabelText, fitQuote, MAX_QUOTE_LENGTH, splitSentences } from "./text.ts";
import type { Lesson, LessonSectionId, RawLabel } from "./types.ts";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const NAMES = ["tylenol", "warfarin", "advil", "lisinopril", "nyquil"] as const;
const ELLIPSIS = "…";

function load(name: string): RawLabel {
  return JSON.parse(readFileSync(path.join(FIXTURES, `${name}.json`), "utf8")) as RawLabel;
}

function lessonFor(name: string): { label: RawLabel; lesson: Lesson } {
  const label = load(name);
  return { label, lesson: buildLesson(String(label["set_id"] ?? name), label) };
}

function quotesOf(lesson: Lesson, id: LessonSectionId): readonly string[] {
  return lesson.sections.find((section) => section.id === id)?.quotes.map((quote) => quote.text) ?? [];
}

function fieldText(label: RawLabel, field: string): string {
  const value = label[field];
  return Array.isArray(value) ? cleanLabelText(value.join(" ")) : "";
}

describe("label lesson extractor", () => {
  for (const name of NAMES) {
    it(`quotes ${name} word for word from the named label section`, () => {
      const { label, lesson } = lessonFor(name);
      for (const section of lesson.sections) {
        assert.ok(section.quotes.length <= MAX_QUOTES, `${section.id} has too many quotes`);
        for (const quote of section.quotes) {
          const core = quote.text.replace(new RegExp(`^${ELLIPSIS} |\\s${ELLIPSIS}$`, "g"), "");
          assert.ok(fieldText(label, quote.field).includes(core), `${name} ${section.id}: not verbatim: ${quote.text}`);
          assert.ok(quote.text.length <= MAX_QUOTE_LENGTH + 4, `${name} ${section.id}: too long`);
          assert.doesNotMatch(quote.text, /^\d+(\.\d+)?\s/, `${name} ${section.id}: section number left in`);
          assert.doesNotMatch(quote.text, /<|\[see /i, `${name} ${section.id}: markup left in`);
        }
      }
    });
  }

  it("catches vitamin K in the warfarin food section", () => {
    const food = quotesOf(lessonFor("warfarin").lesson, "food");
    assert.ok(food.some((text) => /vitamin K/.test(text)), food.join("\n"));
  });

  it("catches drowsiness in the NyQuil rest section", () => {
    const rest = quotesOf(lessonFor("nyquil").lesson, "rest");
    assert.ok(rest.some((text) => /drowsiness/.test(text)), rest.join("\n"));
  });

  it("finds onset and half-life only where the label states them", () => {
    assert.ok(quotesOf(lessonFor("warfarin").lesson, "timing").some((text) => /within 24 hours/.test(text)));
    assert.ok(quotesOf(lessonFor("lisinopril").lesson, "timing").some((text) => /half-life/.test(text)));
    assert.deepEqual(quotesOf(lessonFor("tylenol").lesson, "timing"), []);
  });

  it("leaves a section empty when nothing matches, so the page can say the label does not say", () => {
    assert.deepEqual(quotesOf(lessonFor("tylenol").lesson, "rest"), []);
    assert.deepEqual(quotesOf(lessonFor("advil").lesson, "works"), []);
  });

  it("shows OTC stop-use lines and the label's most common list as side effects", () => {
    assert.ok(quotesOf(lessonFor("advil").lesson, "side")[0].startsWith("Stop use and ask a doctor"));
    assert.match(quotesOf(lessonFor("warfarin").lesson, "side")[0], /Most common adverse reactions/);
  });

  it("adds pregnancy or breast-feeding lines to who should not take it", () => {
    assert.ok(quotesOf(lessonFor("tylenol").lesson, "avoid").some((text) => /pregnant or breast-feeding/.test(text)));
  });

  it("reads the product head from the label", () => {
    const { lesson } = lessonFor("nyquil");
    assert.equal(lesson.kind, "otc");
    assert.equal(lesson.model, "bottle");
    assert.equal(lesson.substances.length, 3);
    assert.equal(lessonFor("tylenol").lesson.model, "capsule");
    assert.equal(lessonFor("warfarin").lesson.kind, "rx");
  });
});

describe("label text cleaning", () => {
  it("drops section numbers, headings and cross references", () => {
    const text = "12 CLINICAL PHARMACOLOGY 12.1 Mechanism of Action Warfarin acts by inhibiting synthesis [see Warnings ( 5.1 )] . 12.2 Pharmacodynamics An effect occurs within 24 hours.";
    assert.deepEqual(splitSentences(cleanLabelText(text)), [
      "Warfarin acts by inhibiting synthesis.",
      "An effect occurs within 24 hours.",
    ]);
  });

  it("keeps abbreviations inside one sentence", () => {
    assert.deepEqual(splitSentences("Some foods interact (e.g., St. John’s wort). Eat a normal diet."), [
      "Some foods interact (e.g., St. John’s wort).",
      "Eat a normal diet.",
    ]);
  });

  it("drops leftover table rows", () => {
    assert.deepEqual(splitSentences("Dizziness 7.5 1.8 3.2 Headache 5.2 4.1 2.0"), []);
  });

  it("splits Drug Facts run-ons at their printed subheadings and bullets", () => {
    assert.deepEqual(splitSentences("Directions • take only as directed • use the cup Allergy alert: may cause rash"), [
      "take only as directed",
      "use the cup",
      "Allergy alert: may cause rash",
    ]);
  });

  it("marks a cut in a long run-on with an ellipsis", () => {
    const long = `${"word ".repeat(120)}grapefruit ${"more ".repeat(60)}`.trim();
    const fitted = fitQuote(long, long.indexOf("grapefruit"));
    assert.ok(fitted.startsWith(ELLIPSIS) && fitted.endsWith(ELLIPSIS) && fitted.includes("grapefruit"));
  });
});

import type { LabelSectionName, LabelSections, Quote } from "./types.ts";
import { excerptAround, splitSentences } from "./text.ts";
import type { TextSpan } from "./text.ts";

const SECTIONS_REPEATED_INSIDE_WARNINGS: readonly LabelSectionName[] = [
  "do_not_use",
  "ask_doctor",
  "ask_doctor_or_pharmacist",
  "when_using",
  "stop_use",
];

export interface LabelSentence {
  readonly section: LabelSectionName;
  readonly text: string;
  readonly drugFactsInstruction?: "do_not_use";
}

// openFDA can flatten the separate items after "Do not take if you are".
// Only recover this boundary after explicit allergy wording and before a co-use bullet.
const ALLERGY_THEN_CO_USE = /(?<=\))\s+(?=(?:if )?(?:you )?(?:are )?taking\b)|\s+(?=or (?:(?:if )?you (?:are )?|are )?(?:taking|take)\b)|(?<=\ballergic to salicylates)\s+(?=taking other salicylate products\b)/i;

function drugFactsSentences(section: LabelSectionName, text: string): readonly LabelSentence[] {
  if (section === "do_not_use" || section === "warnings") {
    const boundary = ALLERGY_THEN_CO_USE.exec(text);
    if (boundary && /\ballerg(?:ic|y)\b/i.test(text.slice(0, boundary.index)) &&
        (section === "do_not_use" || /\bdo not (?:use|take) if\b/i.test(text.slice(0, boundary.index)))) {
      return [
        { section, text: text.slice(0, boundary.index) },
        { section, text: text.slice(boundary.index).trim(), drugFactsInstruction: "do_not_use" },
      ];
    }
  }
  return [{ section, text }];
}

// OTC labels repeat "Do not use", "Ask a doctor" and the other subsections word for word inside "warnings".
function withoutRepeatedSubsections(label: LabelSections, paragraph: string): readonly string[] {
  const repeated = SECTIONS_REPEATED_INSIDE_WARNINGS.flatMap((name) => label[name] ?? []).filter(
    (text) => text.trim() !== "",
  );
  return repeated
    .reduce<readonly string[]>((pieces, text) => pieces.flatMap((piece) => piece.split(text)), [paragraph])
    .filter((piece) => piece.trim() !== "");
}

function passagesOf(label: LabelSections, section: LabelSectionName): readonly string[] {
  const paragraphs = label[section] ?? [];
  return section === "warnings"
    ? paragraphs.flatMap((paragraph) => withoutRepeatedSubsections(label, paragraph))
    : paragraphs;
}

export function sectionSentences(label: LabelSections | undefined, section: LabelSectionName): readonly LabelSentence[] {
  if (label === undefined) return [];
  const drugFacts = SECTIONS_REPEATED_INSIDE_WARNINGS.includes(section) || section === "warnings";
  return passagesOf(label, section).flatMap((passage) =>
    splitSentences(passage, drugFacts).flatMap((text) => drugFactsSentences(section, text)));
}

export function sentencesIn(
  label: LabelSections | undefined,
  sections: readonly LabelSectionName[],
): readonly LabelSentence[] {
  return sections.flatMap((section) => sectionSentences(label, section));
}

const SECTION_TITLES: Readonly<Record<LabelSectionName, string>> = {
  active_ingredient: "Active ingredient",
  purpose: "Purpose",
  indications_and_usage: "Uses",
  warnings: "Warnings",
  do_not_use: "Do not use",
  ask_doctor: "Ask a doctor before use",
  ask_doctor_or_pharmacist: "Ask a doctor or pharmacist before use",
  when_using: "When using this product",
  stop_use: "Stop use",
  dosage_and_administration: "Directions",
  drug_interactions: "Drug interactions",
  boxed_warning: "Boxed warning",
  warnings_and_cautions: "Warnings and precautions",
  contraindications: "Contraindications",
  pregnancy_or_breast_feeding: "If pregnant or breast-feeding",
  pregnancy: "Pregnancy",
  nursing_mothers: "Nursing mothers",
  pediatric_use: "Pediatric use",
  dsld_contains: "DSLD formula contains statement",
  dsld_allergy_precautions: "DSLD allergy precautions",
  dsld_ingredient: "DSLD ingredient record",
  ndc_active_ingredient: "NDC active ingredient record",
  normalized_active_ingredient: "Normalized active ingredient record",
  inactive_ingredient: "Inactive ingredients",
  information_for_patients: "Information for patients",
  spl_medguide: "Medication Guide",
};

export function sectionTitle(section: LabelSectionName): string {
  return SECTION_TITLES[section];
}

const START_OF_TEXT: TextSpan = { start: 0, end: 0 };

export function toQuote(itemId: string, sentence: LabelSentence, focus: TextSpan = START_OF_TEXT): Quote {
  const complete = sentence.section === "boxed_warning" || sentence.section === "contraindications";
  return { text: sentence.text, excerpt: complete ? sentence.text : excerptAround(sentence.text, focus), itemId, section: sentence.section };
}

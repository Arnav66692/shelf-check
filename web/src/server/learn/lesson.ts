import { cleanLabelText, fitQuote, sameText, splitSentences } from "./text.ts";
import type { Lesson, LessonModel, LessonQuote, LessonSection, LessonSectionId, RawLabel } from "./types.ts";

export const MAX_QUOTES = 4;
const DAILYMED_SETID_PAGE = "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=";

export const SECTION_NAMES: Readonly<Record<string, string>> = {
  purpose: "Purpose",
  indications_and_usage: "Uses",
  mechanism_of_action: "Mechanism of action",
  clinical_pharmacology: "Clinical pharmacology",
  pharmacodynamics: "Pharmacodynamics",
  pharmacokinetics: "Pharmacokinetics",
  dosage_and_administration: "Directions",
  when_using: "When using this product",
  do_not_use: "Do not use",
  ask_doctor: "Ask a doctor before use",
  ask_doctor_or_pharmacist: "Ask a doctor or pharmacist before use",
  stop_use: "Stop use and ask a doctor",
  warnings: "Warnings",
  boxed_warning: "Boxed warning",
  warnings_and_cautions: "Warnings and precautions",
  precautions: "Precautions",
  general_precautions: "General precautions",
  drug_interactions: "Drug interactions",
  adverse_reactions: "Adverse reactions",
  contraindications: "Contraindications",
  pregnancy_or_breast_feeding: "Pregnancy or breast-feeding",
  information_for_patients: "Information for patients",
  spl_medguide: "Medication Guide",
  spl_patient_package_insert: "Patient information",
  active_ingredient: "Active ingredient",
};

const SCAN_ORDER = [
  "when_using",
  "spl_medguide",
  "spl_patient_package_insert",
  "information_for_patients",
  "dosage_and_administration",
  "do_not_use",
  "ask_doctor_or_pharmacist",
  "ask_doctor",
  "stop_use",
  "warnings",
  "drug_interactions",
  "precautions",
  "general_precautions",
  "warnings_and_cautions",
  "boxed_warning",
  "pharmacokinetics",
  "clinical_pharmacology",
];

const TIMING_FIELDS = ["pharmacodynamics", "pharmacokinetics", "clinical_pharmacology", "dosage_and_administration"];

export const FOOD_WORDS =
  /\bfoods?\b|\bmeals?\b|empty stomach|\bgrapefruit\b|\balcohol(?:ic)?\b|\bcaffeine\b|\bdairy\b|(?<!breast |human )\bmilk\b|\bantacids?\b|\bvitamin K\b|\bpotassium\b|\bbeverages?\b|\bjuice\b/i;
export const REST_WORDS =
  /\bdrows(?:y|iness)\b|\bsleep(?:y|iness|ing)?\b|\bsomnolence\b|\bdizz(?:y|iness)\b|\bdriv(?:e|ing)\b|motor vehicle|\bmachinery\b/i;
export const TIMING_WORDS =
  /\bonset\b|\bpeak\b|\bwithin (?:about |approximately )?\d+(?:\.\d+)?(?: to \d+(?:\.\d+)?)? ?(?:minutes?|min|hours?|hrs?|days?|weeks?)\b|\bt ?max\b|\bhalf-? ?li(?:fe|ves)\b|\bduration of (?:action|effect)\b|\b(?:begins?|starts?) to work\b/i;
const LEAD_IN_LIMIT = 40;
const FORM_HINT_LENGTH = 300;
const MOST_COMMON = /\bmost (?:common|frequent)|\bcommonly reported\b|\bmost commonly\b/i;

type Candidate = { readonly sentence: string; readonly field: string; readonly matchAt: number };

function fieldTexts(label: RawLabel, field: string): readonly string[] {
  const value = label[field];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sentencesOf(label: RawLabel, field: string): readonly string[] {
  return fieldTexts(label, field).flatMap((text) => splitSentences(cleanLabelText(text)));
}

function toQuote(candidate: Candidate): LessonQuote {
  return {
    text: fitQuote(candidate.sentence, candidate.matchAt),
    field: candidate.field,
    sectionName: SECTION_NAMES[candidate.field] ?? candidate.field.replaceAll("_", " "),
  };
}

function takeDistinct(candidates: readonly Candidate[], limit: number): readonly LessonQuote[] {
  const kept: Candidate[] = [];
  for (const candidate of candidates) {
    if (kept.length >= limit) break;
    if (kept.some((other) => sameText(other.sentence, candidate.sentence))) continue;
    kept.push(candidate);
  }
  return kept.map(toQuote);
}

function leading(label: RawLabel, field: string, count: number): readonly Candidate[] {
  return sentencesOf(label, field)
    .slice(0, count)
    .map((sentence) => ({ sentence, field, matchAt: 0 }));
}

function firstPresent(label: RawLabel, fields: readonly string[], count: number): readonly Candidate[] {
  for (const field of fields) {
    const found = leading(label, field, count);
    if (found.length > 0) return found;
  }
  return [];
}

function matching(label: RawLabel, fields: readonly string[], pattern: RegExp): readonly Candidate[] {
  return fields.flatMap((field) =>
    sentencesOf(label, field).flatMap((sentence) => {
      const match = pattern.exec(sentence);
      return match ? [{ sentence, field, matchAt: match.index }] : [];
    }),
  );
}

function section(id: LessonSectionId, title: string, candidates: readonly Candidate[]): LessonSection {
  return { id, title, quotes: takeDistinct(candidates, MAX_QUOTES) };
}

function sideEffects(label: RawLabel): readonly Candidate[] {
  const adverse = sentencesOf(label, "adverse_reactions").map((sentence) => ({ sentence, field: "adverse_reactions", matchAt: 0 }));
  const common = adverse.flatMap((candidate) => {
    const match = MOST_COMMON.exec(candidate.sentence);
    if (!match) return [];
    const sentence = match.index > LEAD_IN_LIMIT ? `\u2026 ${candidate.sentence.slice(match.index)}` : candidate.sentence;
    return [{ ...candidate, sentence }];
  });
  const stopUse = leading(label, "stop_use", 2);
  return [...common, ...adverse.slice(0, 2), ...stopUse];
}

export function buildSections(label: RawLabel): readonly LessonSection[] {
  return [
    section("for", "What it is for", [...leading(label, "purpose", 1), ...leading(label, "indications_and_usage", 3)]),
    section("works", "How it works", firstPresent(label, ["mechanism_of_action", "clinical_pharmacology"], 2)),
    section("timing", "When it starts working and how long it lasts", matching(label, TIMING_FIELDS, TIMING_WORDS)),
    section("take", "How to take it", leading(label, "dosage_and_administration", MAX_QUOTES)),
    section("food", "Food and drink", matching(label, SCAN_ORDER, FOOD_WORDS)),
    section("side", "Side effects", sideEffects(label)),
    section("rest", "Rest, sleep and driving", matching(label, SCAN_ORDER, REST_WORDS)),
    section("avoid", "Who should not take it", [
      ...firstPresent(label, ["contraindications", "do_not_use"], 3),
      ...leading(label, "pregnancy_or_breast_feeding", 1),
    ]),
  ];
}

function openfdaList(label: RawLabel, key: string): readonly string[] {
  const openfda = label["openfda"];
  if (typeof openfda !== "object" || openfda === null) return [];
  const value = (openfda as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function modelFor(form: string, routes: readonly string[]): LessonModel {
  const text = `${form} ${routes.join(" ")}`.toLowerCase();
  if (/inject|syringe|subcutaneous|intravenous|intramuscular|\bpen\b|vial/.test(text)) return "syringe";
  if (/tablet|capsule|caplet|softgel|gelcap|liqui-?gel/.test(text)) return "capsule";
  return "bottle";
}

export function buildLesson(setId: string, label: RawLabel): Lesson {
  const name = openfdaList(label, "brand_name")[0] ?? openfdaList(label, "generic_name")[0] ?? "This medicine";
  const genericName = openfdaList(label, "generic_name")[0];
  const productType = openfdaList(label, "product_type")[0] ?? "";
  const activeText = fieldTexts(label, "active_ingredient")[0];
  const formText = ["spl_product_data_elements", "active_ingredient", "dosage_and_administration"]
    .map((field) => fieldTexts(label, field)[0]?.slice(0, FORM_HINT_LENGTH) ?? "")
    .join(" ");
  return {
    setId,
    name,
    ...(genericName && genericName.toLowerCase() !== name.toLowerCase() ? { genericName } : {}),
    substances: openfdaList(label, "substance_name"),
    ...(activeText
      ? { activeIngredient: { text: fitQuote(cleanLabelText(activeText)), field: "active_ingredient", sectionName: SECTION_NAMES.active_ingredient } }
      : {}),
    kind: productType.toUpperCase().includes("OTC") ? "otc" : "rx",
    model: modelFor(formText, openfdaList(label, "route")),
    recordUrl: `${DAILYMED_SETID_PAGE}${encodeURIComponent(setId)}`,
    sections: buildSections(label),
  };
}

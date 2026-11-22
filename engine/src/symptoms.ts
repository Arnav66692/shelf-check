import { sentencesIn, toQuote } from "./labelText.ts";
import type { CabinetItem, LabelSectionName, Quote } from "./types.ts";

export const SYMPTOM_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "nasal congestion": ["nasal congestion", "stuffy nose", "stuffed up", "blocked nose", "sinus congestion", "congestion"],
  fever: ["fever", "feverish", "high temperature"],
  headache: ["headache", "headaches", "head hurts", "head is pounding"],
  cough: ["cough", "coughing"],
  "runny nose": ["runny nose", "nose is running", "sneezing", "sneeze"],
  "sore throat": ["sore throat", "throat hurts", "scratchy throat"],
  heartburn: ["heartburn", "acid reflux", "acid indigestion", "sour stomach"],
  allergy: ["allergy", "allergies", "hay fever", "itchy eyes", "watery eyes"],
  "trouble sleeping": ["trouble sleeping", "can't sleep", "cannot sleep", "insomnia", "sleeplessness", "sleepless"],
  "aches and pains": ["aches", "ache", "muscle pain", "muscular aches", "body aches", "backache", "back pain"],
};

export const RED_FLAG_SYMPTOMS: readonly string[] = [
  "chest pain",
  "trouble breathing",
  "can't breathe",
  "cannot breathe",
  "difficulty breathing",
  "face drooping",
  "slurred speech",
  "severe allergic reaction",
  "anaphylaxis",
  "overdose",
  "overdosed",
  "suicidal thoughts",
  "suicidal",
  "kill myself",
  "worst headache of my life",
  "fainting",
  "fainted",
  "passed out",
  "coughing blood",
  "coughing up blood",
];

const USES_SECTIONS: readonly LabelSectionName[] = ["indications_and_usage", "purpose"];

export interface SymptomMatch {
  readonly item: CabinetItem;
  readonly symptoms: readonly string[];
  readonly quote: Quote;
}

export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(normalisedText: string, phrase: string): boolean {
  return ` ${normalisedText} `.includes(` ${normaliseText(phrase)} `);
}

const KNOWN_SYMPTOM_PHRASES: readonly string[] = Object.values(SYMPTOM_SYNONYMS).flat().map(normaliseText);

// "hay fever" is an allergy, so the word "fever" inside it must not count as a fever.
function containsSymptomPhrase(normalisedText: string, phrase: string): boolean {
  const wanted = ` ${normaliseText(phrase)} `;
  const longerPhrases = KNOWN_SYMPTOM_PHRASES.filter((known) => ` ${known} ` !== wanted && ` ${known} `.includes(wanted));
  const masked = longerPhrases.reduce((text, known) => text.replaceAll(` ${known} `, " | "), ` ${normalisedText} `);
  return masked.includes(wanted);
}

export function isEmergency(text: string): boolean {
  const normalised = normaliseText(text);
  return RED_FLAG_SYMPTOMS.some((phrase) => containsPhrase(normalised, phrase));
}

export function symptomsMentioned(text: string): readonly string[] {
  const normalised = normaliseText(text);
  return Object.entries(SYMPTOM_SYNONYMS)
    .filter(([, phrases]) => phrases.some((phrase) => containsSymptomPhrase(normalised, phrase)))
    .map(([symptom]) => symptom);
}

function matchItem(item: CabinetItem, symptoms: readonly string[]): readonly SymptomMatch[] {
  const sentences = sentencesIn(item.label, USES_SECTIONS).map((sentence) => ({
    ...sentence,
    normalised: normaliseText(sentence.text),
  }));
  const hits = symptoms.flatMap((symptom) => {
    const phrases = SYMPTOM_SYNONYMS[symptom] ?? [];
    const sentence = sentences.find((candidate) =>
      phrases.some((phrase) => containsSymptomPhrase(candidate.normalised, phrase)),
    );
    return sentence === undefined ? [] : [{ symptom, sentence }];
  });
  const [first] = hits;
  if (first === undefined) return [];
  return [
    {
      item,
      symptoms: hits.map((hit) => hit.symptom),
      quote: toQuote(item.id, first.sentence),
    },
  ];
}

export function matchSymptoms(text: string, items: readonly CabinetItem[]): readonly SymptomMatch[] {
  const symptoms = symptomsMentioned(text);
  return symptoms.length === 0 ? [] : items.flatMap((item) => matchItem(item, symptoms));
}

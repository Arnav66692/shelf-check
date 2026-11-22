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
  "chest pressure",
  "shortness of breath",
  "trouble breathing",
  "can't breathe",
  "cannot breathe",
  "not breathing",
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
  "worst headache",
  "unconscious",
  "seizure",
  "seizures",
  "vomiting blood",
  "severe bleeding",
  "throat swelling",
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

const CONDITIONS = new Map(Object.entries(SYMPTOM_SYNONYMS).flatMap(([name, phrases]) =>
  phrases.map((phrase) => [normaliseText(phrase), name] as const),
));
const RED_FLAGS = new Set(RED_FLAG_SYMPTOMS.map(normaliseText));
// Prefer "hay fever" to "fever", and "worst headache" to "headache".
const PHRASES = new RegExp(`\\b(?:${[...new Set([...CONDITIONS.keys(), ...RED_FLAGS])].sort((a, b) => b.length - a.length).join("|")})\\b`, "g");
const CLAUSE_BREAK = /[.!;]|(?<=\?)\s+|\b(?:but|however|instead|only|just)\b|(?:\band\b|,)\s*(?=(?:now |today )?(?:i|he|she|they|we)\s)/i;
const DENIAL = /\b(?:no|not|never|without|den(?:y|ies|ied)|negative for|free of|(?:dont|doesnt|didnt|do not|does not|did not) (?:have|experience|feel))\b/g;
const DIRECT_DENIAL_TAIL = /^(?:\s+(?:a|an|any|current|signs?|symptoms?|of|severe|having|experiencing|have|for|longer))*\s*$/;
const UNCERTAIN = /\b(?:maybe|possibly|possible|unsure|uncertain|not sure|not certain|might|could|whether|if|rule out|cannot exclude|cant (?:tell|say|confirm)|cannot (?:say|confirm)|dont know|do not know|cant deny|cannot deny|not without|not denying)\b/;
const NEGATIVE_SUFFIX = /^\s+(?:(?:is|was|are|were)\s+)?(?:absent|denied|not present|free)\s*(?:$|,|\b(?:and|or|nor)\b)/;

function screen(text: string): { emergency: boolean; symptoms: Set<string> } {
  const symptoms = new Set<string>();
  let emergency = false;
  for (const raw of text.replace(/[‘’']/g, "").split(CLAUSE_BREAK)) {
    const clause = raw.toLowerCase().replace(/[^a-z0-9,?]+/g, " ").trim();
    let previousEnd = 0;
    let previousDenied = false;
    let denialInClause = false;
    const uncertain = UNCERTAIN.test(clause) || raw.includes("?");
    for (const hit of clause.matchAll(PHRASES)) {
      const lead = clause.slice(previousEnd, hit.index);
      const denials = [...lead.matchAll(DENIAL)];
      const denial = denials.at(-1);
      const end = hit.index + hit[0].length;
      const tail = clause.slice(end);
      const denialEndsAtSymptom = /^\s*(?:$|,|\b(?:and|or|nor|today|now|currently)\b)/.test(tail);
      const directlyDenied = denialEndsAtSymptom && denials.length === 1 && denial !== undefined &&
        DIRECT_DENIAL_TAIL.test(lead.slice(denial.index + denial[0].length));
      const listDenial: boolean = denialEndsAtSymptom && previousDenied && /^\s*(?:or|nor)\s*$/.test(lead);
      const denied: boolean = !uncertain && (directlyDenied || listDenial || NEGATIVE_SUFFIX.test(clause.slice(end)));
      if (RED_FLAGS.has(hit[0]) && !denied) emergency = true;
      denialInClause ||= denials.length > 0;
      const symptom = CONDITIONS.get(hit[0]);
      if (symptom && !denied && !uncertain && !denialInClause) symptoms.add(symptom);
      previousEnd = end;
      previousDenied = denied;
    }
  }
  return { emergency, symptoms };
}

export function isEmergency(text: string): boolean {
  return screen(text).emergency;
}

export function symptomsMentioned(text: string): readonly string[] {
  const result = screen(text);
  return result.emergency ? [] : Object.keys(SYMPTOM_SYNONYMS).filter((symptom) => result.symptoms.has(symptom));
}

function matchItem(item: CabinetItem, symptoms: readonly string[]): readonly SymptomMatch[] {
  const sentences = sentencesIn(item.label, USES_SECTIONS).map((sentence) => ({
    ...sentence,
    indications: screen(sentence.text).symptoms,
  }));
  const hits = symptoms.flatMap((symptom) => {
    const sentence = sentences.find((candidate) => candidate.indications.has(symptom));
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

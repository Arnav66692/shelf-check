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

// The reason describes what the person reported. It is not a diagnosis.
const EMERGENCY_RULES = {
  poison: {
    phrases: ["overdose", "overdosed", "poisoning", "poisoned"],
    pattern: /overdos(?:es|ing)|(?:took|taken|taking|swallowed|given|gave|ingested) (?:way )?too (?:much|many)|too many (?:pills|tablets|capsules|doses)|too much (?:medicine|medication|tylenol|acetaminophen|ibuprofen)|accidentally (?:swallowed|ingested)|(?:swallowed|ate|drank|ingested) (?:\w+ ){0,6}(?:pills?|tablets?|capsules?|meds|medicines?|medications?|cough syrup|tylenol|acetaminophen|ibuprofen|advil|aspirin|poison|bleach|cleaner|detergent|batter(?:y|ies)|something unknown)|got into (?:the |my |grandma'?s )?(?:medicine|meds|pills|cabinet)|ate (?:a |the |some )?(?:\w+ ){0,3}(?:vitamins?|gumm(?:y|ies)|iron)|(?:double|extra|second) dose|took (?:my |his |her )?(?:\w+ ){0,3}twice|(?:sleepy|drowsy|hard to wake|won'?t wake|can'?t wake)[^.]{0,60}(?:breath\w*|pain pills?|opioid|oxy\w*|fentanyl)|breathing (?:is )?(?:slow|shallow|weird)|won'?t wake up|not waking|(?:took|ate|swallowed|had|taken) (?:like |about |around |maybe |almost )?\d{2,} |took a bunch of|accidentally (?:took|taken|ate|gave|swallowed)|(?:pills|meds|medicine|medication|dose) by mistake|(?:took|taken|gave|given) (?:the )?wrong (?:pills|meds|medicine|medication|dose)|(?:cant|cannot|wont) wake (?:him|her|them|up)|snoring (?:weird|strange|loud|funny)|fentanyl patch|chew\w* (?:on )?(?:a |his |her |my )?\w* ?patch|whole bottle|a bottle of (?:his |her |my |their )?(?:pills|meds|medicine)|double (?:my |his |her |the )?(?:insulin|dose|meds|pills)|(?:took|gave|given|taken) [a-z0-9 ]{0,40} by mistake|(?:pill|pills|dose|doses) (?:\d+|two|three|four) times|drank (?:some |the )?(?:lamp oil|kerosene|gasoline|gas|bleach|antifreeze|lighter fluid|cleaner)|swallowed (?:a |some |two )?(?:magnets?|buttons?)|(?:ambien|xanax|valium|klonopin|ativan|zolpidem|sleeping pills?)[a-z0-9 ]{0,30}(?:drinks|alcohol|beer|wine|vodka)|barely (?:keep (?:my|his|her) eyes open|stay awake)/,
  },
  self_harm: {
    phrases: ["suicidal thoughts", "suicidal", "kill myself", "want to die", "end my life"],
    pattern: /suicide|killing myself|hurt myself on purpose|don'?t want to (?:be here|live|wake up)|ending it|end it all|better off dead|pills? (?:saved|stockpiled|saving|stored) up|better off without me|no reason to live|(?:plan|planning) to (?:end|kill)|sleep forever|never wake up|want to overdose|(?:going|gonna) to overdose|take (?:all|the whole bottle) of (?:my|them)/,
  },
  chest_symptoms: {
    phrases: ["chest pain", "chest pressure", "chest tightness", "heart attack"],
    pattern: /chest (?:feels? |is )?(?:tight|painful|hurts?)|(?:pain|pressure|tightness) in (?:my |the )?chest|sweat\w*[a-z ]{0,30}jaw|jaw[a-z ]{0,30}sweat\w*/,
  },
  breathing_difficulty: {
    phrases: ["shortness of breath", "short of breath", "trouble breathing", "can't breathe", "cannot breathe", "not breathing", "difficulty breathing", "blue lips"],
    pattern: /hard to breathe|(?:cant|cannot) (?:catch my breath|get enough air)|turning blue|gurgling|gasping for (?:air|breath)/,
  },
  stroke_signs: {
    phrases: ["stroke", "face drooping", "slurred speech"],
    pattern: /face (?:is )?droop\w*|droop\w* face|one side (?:of (?:my|his|her) (?:body|face) )?(?:is )?(?:weak|numb)|can'?t (?:talk|speak) (?:right|properly)|slurr\w*|can'?t feel (?:my|his|her) (?:left |right )?(?:arm|leg|face)|(?:mouth|smile|lip|face) (?:is )?droop\w*|droop\w* (?:on )?one side|(?:left|right|one) side (?:of (?:my|his|her) (?:body|face) )?(?:went|is|feels|has gone) (?:numb|weak|dead)|words (?:are )?(?:coming out wrong|jumbled|all wrong)|vision in one eye|sudden(?:ly)? (?:blurry |lost |loss of )?(?:vision|blind)/,
  },
  seizure: { phrases: ["seizure", "seizures"], pattern: /convuls(?:ion|ions|ing)/ },
  airway_swelling: {
    phrases: ["severe allergic reaction", "anaphylaxis", "throat swelling"],
    pattern: /(?:lips?|tongue|throat|face) (?:(?:is|are|feels?|started) )?(?:swelling|swollen)|(?:swelling|swollen) (?:of |in )?(?:my |the )?(?:lips?|tongue|throat|face)|throat (?:is )?(?:closing|tight)|hives[^.]{0,40}(?:dizzy|faint|breath)|lips? (?:are |is |turn\w* )?blue|(?:eyes|lips?|face|tongue)(?: and (?:eyes|lips?|face|tongue))? (?:swelled|swelling|swollen|puffed)|throat (?:feels |is )?(?:tight|closing|swelling)/,
  },
  severe_headache: {
    phrases: ["worst headache of my life", "worst headache", "severe headache", "sudden headache"],
    pattern: /headache (?:with|and) (?:a |my )?stiff neck|stiff neck (?:with|and) (?:a )?headache|headache (?:with |and )?(?:a |my )?stiff neck|stiff neck[a-z ]{0,30}fever|pregnant[a-z ]{0,60}(?:seeing spots|blurry vision|bad headache|severe headache)/,
  },
  bleeding: {
    phrases: ["vomiting blood", "coughing blood", "coughing up blood", "severe bleeding"],
    pattern: /(?:vomit(?:ed|ing)?|cough(?:ed|ing)?) (?:up )?(?:some )?blood|blood in (?:my |the )?(?:vomit|stools?)|(?:bloody|black(?: tarry)?) stools?|(?:black|bloody|tarry) (?:poop|stool|bowel)|poop is black|bleeding (?:and it )?(?:won'?t|doesn'?t|will not) stop|nosebleed won'?t stop|(?:hit|bumped|banged) (?:my|his|her) head|coffee grounds?|(?:peeing|pee|urine|urinating) (?:blood|is red|is bloody)|blood in (?:my |the |his |her )?(?:pee|urine)/,
  },
  drug_reaction: {
    phrases: ["serotonin syndrome", "rhabdomyolysis", "digoxin toxicity"],
    pattern: /(?:dark|brown|cola|tea)[- ]?colou?red (?:pee|urine)|(?:pee|urine) is (?:dark )?brown|dark brown (?:pee|urine)|(?:confused|twitching|shivering|rigid|agitated)[^.]{0,80}(?:tramadol|zoloft|sertraline|ssri|maoi|prozac|lexapro)|heart (?:is )?(?:beating )?(?:super|very|really|so) slow|(?:faint|dizzy|fainting|passing out)[^.]{0,30}digoxin|(?:skin|rash)[a-z ]{0,20}(?:peeling|blistering)|blistering rash|(?:fever)[a-z ]{0,20}muscles (?:are |feel )?(?:stiff|rigid)|muscles (?:are |feel )?(?:stiff|rigid) after (?:starting|taking)|lithium[a-z ]{0,30}(?:shaking|throwing up|vomiting|confused)|yellow (?:eyes|skin)|(?:eyes|skin) (?:are |is |turning |look )?yellow|blood sugar (?:is |was |of |at )?(?:[1-4]\d|5[0-4])\b|erection[a-z ]{0,30}(?:[4-9]|\d{2}) hours/,
  },
  loss_of_consciousness: { phrases: ["unresponsive", "unconscious", "fainting", "fainted", "passed out"] },
} as const;

export type EmergencyReason = keyof typeof EMERGENCY_RULES | "infant_fever";
export type EmergencyScreen =
  | { readonly emergency: false }
  | { readonly emergency: true; readonly reason: EmergencyReason; readonly poison: boolean; readonly selfHarm: boolean };

// The caller can pass a verified age in months. Web profiles store whole years,
// where zero alone does not distinguish six weeks from eleven months.
export interface SymptomAge {
  readonly ageMonths?: number;
}

export const RED_FLAG_SYMPTOMS: readonly string[] = Object.values(EMERGENCY_RULES).flatMap(({ phrases }) => [...phrases]);

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
const REASONS = Object.keys(EMERGENCY_RULES) as (keyof typeof EMERGENCY_RULES)[];
const emergencyGroups = REASONS.map((reason) => {
  const rule = EMERGENCY_RULES[reason];
  const phrases = rule.phrases.map(normaliseText).sort((a, b) => b.length - a.length);
  if ("pattern" in rule) phrases.unshift(rule.pattern.source);
  return `(?<${reason}>${phrases.join("|")})`;
});
// Match longer phrases first so "hay fever" doesn't become "fever".
const symptomGroup = [...CONDITIONS.keys()].sort((a, b) => b.length - a.length).join("|");
const PHRASES = new RegExp(`\\b(?:${emergencyGroups.join("|")}|${symptomGroup})\\b`, "g");
const CLAUSE_BREAK = /[.!;]|(?<=\?)\s+|\b(?:but|however|instead)\b|\b(?:only|just)\b(?!\s+\d+[- ](?:days?|weeks?|months?)\b)|(?:\band\b|,)\s*(?=(?:now |today )?(?:i|he|she|they|we)\s)/i;
const DENIAL = /\b(?:no|not|never|without|den(?:y|ies|ied)|negative for|free of|(?:dont|doesnt|didnt|do not|does not|did not) (?:have|experience|feel)|dont|doesnt|didnt)\b/g;
const DIRECT_DENIAL_TAIL = /^(?:\s+(?:a|an|any|current|signs?|symptoms?|of|severe|having|experiencing|have|for|longer))*\s*$/;
const UNCERTAIN = /\b(?:maybe|possibly|possible|unsure|uncertain|not sure|not certain|might|could|whether|if|rule out|cannot exclude|cant (?:tell|say|confirm)|cannot (?:say|confirm)|dont know|do not know|cant deny|cannot deny|not without|not denying)\b/;
const NEGATIVE_SUFFIX = /^\s+(?:(?:is|was|are|were)\s+)?(?:absent|denied|not present|free)\s*(?:$|,|\b(?:and|or|nor)\b)/;

function youngInfant(clause: string, age?: SymptomAge): boolean {
  if (age?.ageMonths !== undefined && age.ageMonths >= 0 && age.ageMonths < 3) return true;
  if (/\bnewborn\b/.test(clause)) return true;
  const match = /\b(\d+) (days?|weeks?|wks?|months?|mos?) old\b/.exec(clause);
  if (!match?.[2]) return false;
  const upperBound = match[2].startsWith("d") ? 90 : match[2].startsWith("w") ? 13 : 3;
  return Number(match[1]) < upperBound;
}

function reportsInfantFever(clause: string, neighboring: readonly (string | undefined)[], age?: SymptomAge): boolean {
  if (youngInfant(clause, age)) return true;
  const infant = /\b(?:baby|infant|newborn)\b/;
  return neighboring.some((other) => other && youngInfant(other) &&
    (infant.test(clause) || (/^(?:he|she|they)\b/.test(clause) && infant.test(other))));
}

function screen(text: string, age?: SymptomAge): { result: EmergencyScreen; symptoms: Set<string> } {
  const symptoms = new Set<string>();
  const reasons = new Set<EmergencyReason>();
  // A blocked nose ("cant breathe through my nose") is not trouble breathing.
  const clauses = text.toLowerCase().replace(/[‘’']/g, "").replace(/\bbreathe? (?:out of|through) (?:my|the|his|her|their) nose\b/g, "stuffy nose").split(CLAUSE_BREAK)
    .map((raw) => raw.replace(/[^a-z0-9,?]+/g, " ").trim()).filter(Boolean);
  for (const [index, clause] of clauses.entries()) {
    let previousEnd = 0;
    let previousDenied = false;
    let denialInClause = false;
    const uncertain = UNCERTAIN.test(clause) || clause.includes("?");
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
      if (!denied) {
        const reason = REASONS.find((entry) => hit.groups?.[entry] !== undefined);
        if (reason) reasons.add(reason);
        if (CONDITIONS.get(hit[0]) === "fever" && reportsInfantFever(clause, [clauses[index - 1], clauses[index + 1]], age)) {
          reasons.add("infant_fever");
        }
      }
      denialInClause ||= denials.length > 0;
      const symptom = CONDITIONS.get(hit[0]);
      if (symptom && !denied && !uncertain && !denialInClause) symptoms.add(symptom);
      previousEnd = end;
      previousDenied = denied;
    }
  }
  const poison = reasons.has("poison");
  const selfHarm = reasons.has("self_harm");
  // An intentional ingestion can require both resources.
  const reason = poison ? "poison" : selfHarm ? "self_harm" : reasons.values().next().value;
  const result: EmergencyScreen = reason === undefined
    ? { emergency: false }
    : { emergency: true, reason, poison, selfHarm };
  return { result, symptoms };
}

export function screenEmergency(text: string, age?: SymptomAge): EmergencyScreen {
  return screen(text, age).result;
}

export function isEmergency(text: string, age?: SymptomAge): boolean {
  return screenEmergency(text, age).emergency;
}

export function symptomsMentioned(text: string, age?: SymptomAge): readonly string[] {
  const { result, symptoms } = screen(text, age);
  return result.emergency ? [] : Object.keys(SYMPTOM_SYNONYMS).filter((symptom) => symptoms.has(symptom));
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

export function matchSymptoms(text: string, items: readonly CabinetItem[], age?: SymptomAge): readonly SymptomMatch[] {
  const symptoms = symptomsMentioned(text, age);
  return symptoms.length === 0 ? [] : items.flatMap((item) => matchItem(item, symptoms));
}

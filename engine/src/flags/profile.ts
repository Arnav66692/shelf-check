import { sectionSentences, sectionTitle, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { formatNumber, termRegExp } from "../text.ts";
import type { TextSpan } from "../text.ts";
import type { CabinetItem, Flag, FlagNumbers, LabelSectionName, ProfileMatchKind, Quote, Severity } from "../types.ts";
import { severityForSection } from "./severity.ts";
import { allergyFamily, familyLabelWords, isNsaid, isNsaidName } from "./allergyFamilies.ts";

export const CONDITION_IDS = [
  "liver_disease",
  "kidney_disease",
  "high_blood_pressure",
  "heart_disease",
  "diabetes",
  "glaucoma",
  "enlarged_prostate",
  "thyroid_disease",
  "breathing_problem",
  "stomach_ulcers_or_bleeding",
] as const;

export type ConditionId = (typeof CONDITION_IDS)[number];

export interface HealthProfile {
  readonly ageYears?: number | undefined;
  readonly pregnant?: boolean | undefined;
  readonly breastfeeding?: boolean | undefined;
  readonly drinksThreeOrMoreDaily?: boolean | undefined;
  readonly conditions: readonly ConditionId[];
  readonly allergies: readonly string[];
}

export class InvalidProfileError extends Error {
  constructor(problem: string) {
    super(`The health profile cannot be used: ${problem}.`);
    this.name = "InvalidProfileError";
  }
}

interface ConditionRule {
  readonly label: string;
  readonly phrases: readonly string[];
}

// The wording Drug Facts labels use for each condition, plus the plain clinical form prescription labels use.
// "asthma (wheezing)" is left out because that is a label listing asthma as an allergic reaction.
export const CONDITION_RULES: Readonly<Record<ConditionId, ConditionRule>> = {
  liver_disease: {
    label: "liver disease",
    phrases: ["liver (?:or kidney )?disease", "liver cirrhosis", "cirrhosis", "liver problems?", "hepatic (?:impairment|disease|insufficiency)"],
  },
  kidney_disease: {
    label: "kidney disease",
    phrases: ["kidney disease", "kidney problems?", "renal (?:impairment|disease|insufficiency)", "compromised renal function"],
  },
  high_blood_pressure: { label: "high blood pressure", phrases: ["high blood pressure"] },
  heart_disease: { label: "heart disease", phrases: ["heart disease", "heart problems?", "heart condition"] },
  diabetes: { label: "diabetes", phrases: ["diabetes", "diabetic(?![-\\s]+(?:keto)?acidosis)"] },
  glaucoma: { label: "glaucoma", phrases: ["glaucoma"] },
  enlarged_prostate: {
    label: "trouble urinating due to an enlarged prostate",
    phrases: ["trouble urinating", "difficulty (?:in )?urinat(?:ing|ion)", "enlarged prostate", "enlargement of the prostate", "prostate gland"],
  },
  thyroid_disease: {
    label: "thyroid disease",
    phrases: ["thyroid disease", "thyroid problems?", "hyperthyroidism", "hypothyroidism", "overactive thyroid"],
  },
  breathing_problem: {
    label: "a breathing problem such as asthma, emphysema or chronic bronchitis",
    phrases: ["breathing problems?", "asthma(?!\\s*\\(wheezing\\))", "emphysema", "chronic bronchitis", "chronic obstructive pulmonary disease", "COPD", "bronchospastic (?:disease|lung disease)"],
  },
  stomach_ulcers_or_bleeding: {
    label: "stomach ulcers or bleeding problems",
    phrases: ["stomach ulcers?", "bleeding (?:problems?|disorders?|tendenc(?:y|ies))", "active ulcer(?:s|ation)?", "ulcers?", "history of stomach problems"],
  },
};

const STRONGEST_FIRST: readonly LabelSectionName[] = ["boxed_warning", "contraindications", "do_not_use"];
const CONDITION_SECTIONS: readonly LabelSectionName[] = [...STRONGEST_FIRST, "ask_doctor", "warnings", "warnings_and_cautions"];
const PREGNANCY_SECTIONS: readonly LabelSectionName[] = [
  ...STRONGEST_FIRST,
  "pregnancy_or_breast_feeding",
  "ask_doctor",
  "warnings",
  "warnings_and_cautions",
  "pregnancy",
];
const BREASTFEEDING_SECTIONS: readonly LabelSectionName[] = [
  ...STRONGEST_FIRST,
  "pregnancy_or_breast_feeding",
  "ask_doctor",
  "warnings",
  "warnings_and_cautions",
  "nursing_mothers",
];
const AGE_SECTIONS: readonly LabelSectionName[] = [...STRONGEST_FIRST, "pediatric_use", "dosage_and_administration", "warnings"];
const INGREDIENT_SECTIONS: readonly LabelSectionName[] = ["active_ingredient", "inactive_ingredient"];
const ALLERGY_WARNING_SECTIONS: readonly LabelSectionName[] = [...STRONGEST_FIRST, "warnings", "warnings_and_cautions", "precautions"];

const ALCOHOL_PATTERN = /\b(?:3|three) or more alcoholic drinks\b/i;
const PREGNANCY_PATTERN = /\b(?:pregnan(?:t|cy)|gestation)\b/i;
const REASSURING_PREGNANCY = /\b(?:not (?:demonstrated|shown) (?:any )?evidence|no evidence of (?:harm|risk|adverse|fetal|embryo|developmental|teratogenic)|pregnancy category [ab])\b/i;
const PREGNANCY_RESTRICTION = /\b(?:avoid(?:ed)?|discontinue|contraindicated|should not (?:be (?:used|taken)|use|take)|not to (?:use|take)|do not (?:use|take)|limit (?:the )?(?:use|dose|duration))\b/i;
const NEGATED_RESTRICTION = /\b(?:not (?:contraindicated|required to avoid)|(?:need not|no need to|not necessary to|not to) (?:be )?avoid(?:ed)?)\b/i;
const TWENTY_WEEKS = /\b20 weeks?(?: (?:of )?(?:gestation|pregnancy))?\s+(?:or later|and (?:beyond|later)|onward)\b/i;
const FETAL_RISK = /\b(?:may|can) (?:harm (?:your|the) (?:unborn baby|fetus)|cause (?:fetal renal dysfunction|oligohydramnios|problems in the unborn child))\b/i;
const BREASTFEEDING_PATTERN = /\bbreast[- ]?feed(?:ing)?\b|\bnursing\b|\blactat(?:ion|ing)\b/i;
const ALLERGY_WORDING = /(?:\b(?:allerg(?:y|ic|ies)|hypersensitiv\w*|anaphyla\w*)\b)|\bangioedema\b/i;
const NEGATED_ALLERGY = /\b(?:no(?: evidence of)?|not|without(?: a history of)?)\s+(?:an?\s+)?(?:known\s+)?(?:allerg\w*|hypersensitiv\w*|anaphyla\w*)/i;
const UNCERTAIN_OR_NEGATIVE_DECLARATION = /\b(?:may|might|no|not|free|without|except|facility|equipment)\b/i;
const MAX_SUPPORTING_QUOTES = 5;

const AGE_NUMBER = "(\\d{1,3})";
const YEARS = "(?:years?|yrs?\\.?)(?:\\s+of\\s+age)?";
const RESTRICTION = "(do not use|do not give|ask a doctor|consult a doctor)";
const AGE_CLAUSE_PATTERNS: readonly { readonly pattern: RegExp; readonly kind: AgeClauseKind }[] = [
  { kind: "from_to_under", pattern: new RegExp(`${AGE_NUMBER}\\s+to\\s+under\\s+${AGE_NUMBER}\\s*${YEARS}\\s*[:•■▪●]?\\s*${RESTRICTION}`, "gi") },
  { kind: "under", pattern: new RegExp(`(?<!to\\s)under\\s+${AGE_NUMBER}\\s*${YEARS}\\s*[:•■▪●]?\\s*${RESTRICTION}`, "gi") },
  { kind: "from_to", pattern: new RegExp(`${AGE_NUMBER}\\s+to\\s+${AGE_NUMBER}\\s*${YEARS}\\s*[:•■▪●]?\\s*${RESTRICTION}`, "gi") },
  { kind: "or_older", pattern: new RegExp(`\\bage\\s+${AGE_NUMBER}\\s+(?:or|and)\\s+(?:older|over)\\b`, "gi") },
  {
    kind: "not_intended_under",
    pattern: new RegExp(`(not intended for use by|not for use by)\\s+\\w+\\s+under\\s+(?:the\\s+age\\s+of\\s+)?${AGE_NUMBER}\\b(?!\\s+months?)`, "gi"),
  },
];
// Inside "Do not use" the heading itself is the instruction, so the age line needs no verb after it.
const UNDER_AGE_IN_DO_NOT_USE = new RegExp(`under\\s+${AGE_NUMBER}\\s*${YEARS}`, "gi");
const DO_NOT_USE_WORDING = /do not (?:use|give)/i;
const AGE_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const UNDER_THRESHOLD = `(?:younger than|under|less than)\\s+(?<age>\\d{1,3}|${AGE_WORDS.join("|")})\\s*(?<unit>years?|months?)(?:\\s+of\\s+age)?`;
const AUDIENCE = "(?:children|infants?|pediatric patients|patients|persons)";
// The age can end the sentence, or a second restriction can follow ("... and in children younger than 18 ... following tonsillectomy").
const AGE_END = "(?=\\s*(?:\\(see\\b[^)]*\\)|\\[see\\b[^\\]]*\\])?\\s*[.!]?\\s*$|\\s+and\\s+(?:in\\s+)?(?:children|infants?|pediatric|patients|adolescents)\\b|\\s*[,;])";
const INSTRUCTION_FIRST = "(?:is|are) contraindicated|contraindicated|do not (?:use|give)(?: this (?:product|medicine))?|ask a doctor before use";
const RESTRICTIONS_WITH_UNITS = [
  new RegExp(`\\b(?<instruction>${INSTRUCTION_FIRST})\\s+(?:in|to|for)\\s+${AUDIENCE}\\s+${UNDER_THRESHOLD}${AGE_END}`, "gi"),
  new RegExp(`\\b${AUDIENCE}\\s+${UNDER_THRESHOLD}\\s*[:,–-]?\\s*(?<instruction>do not use|do not give|ask a doctor|consult a doctor)${AGE_END}`, "gi"),
];

type AgeClauseKind = "from_to_under" | "under" | "from_to" | "not_intended_under" | "or_older";
const NO_UPPER_AGE = 200;

interface PhraseHit {
  readonly sentence: LabelSentence;
  readonly span: TextSpan;
  readonly text: string;
}

interface AgeClause {
  readonly hit: PhraseHit;
  readonly fromYears: number;
  readonly belowYears: number;
  readonly severity: Severity;
}

interface FlagWording {
  readonly kind: ProfileMatchKind;
  readonly term: string;
  readonly title: string;
  readonly about: string;
  readonly explain: string;
  readonly detail?: string;
  readonly severity?: Severity;
  readonly numbers?: FlagNumbers;
  readonly fullPrimaryQuote?: boolean;
}

function hitsIn(sentence: LabelSentence, pattern: RegExp): readonly PhraseHit[] {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return [...sentence.text.matchAll(global)].map((found) => ({
    sentence,
    span: { start: found.index, end: found.index + found[0].length },
    text: found[0],
  }));
}

function firstHitPerSentence(item: CabinetItem, sections: readonly LabelSectionName[], pattern: RegExp): readonly PhraseHit[] {
  return sections.flatMap((section) =>
    sectionSentences(item.label, section).flatMap((sentence) => hitsIn(sentence, pattern).slice(0, 1)),
  );
}

function quoteOf(item: CabinetItem, hit: PhraseHit): Quote {
  return toQuote(item.id, hit.sentence, hit.span);
}

function distinctQuotes(quotes: readonly Quote[]): readonly Quote[] {
  return quotes.filter((quote, index) => quotes.findIndex((other) => other.text === quote.text) === index);
}

function capitalise(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function toFlag(item: CabinetItem, hits: readonly PhraseHit[], wording: FlagWording): readonly Flag[] {
  const [best] = hits;
  if (best === undefined) return [];
  const section = best.sentence.section;
  const primary = quoteOf(item, best);
  const quote = wording.fullPrimaryQuote ? { ...primary, excerpt: primary.text } : primary;
  const supportingQuotes = distinctQuotes([quote, ...hits.slice(1).map((hit) => quoteOf(item, hit))]).slice(0, MAX_SUPPORTING_QUOTES);
  const where = capitalise(`the "${sectionTitle(section)}" section of the ${item.displayName} label`);
  return [
    {
      type: "profile",
      severity: wording.severity ?? severityForSection(section),
      itemIds: [item.id],
      title: wording.title,
      detail: wording.detail ?? `${where} mentions ${wording.about} ("${best.text}"). Your profile says this applies to you. Ask a pharmacist or doctor before using ${item.displayName}.`,
      explain: wording.explain,
      quote,
      match: { text: best.text, term: wording.term, kind: wording.kind },
      ...(supportingQuotes.length > 1 ? { supportingQuotes } : {}),
      ...(wording.numbers === undefined ? {} : { numbers: wording.numbers }),
    },
  ];
}

function conditionPattern(condition: ConditionId): RegExp {
  return new RegExp(`(?<![A-Za-z0-9])(?:${CONDITION_RULES[condition].phrases.join("|")})(?![A-Za-z0-9])`, "i");
}

// "Ask a doctor if you have" and "Do not use if" address the reader. Running warning text may only mention the
// condition, for example as a side effect, so the plain sentence does not claim more than that.
const SECTIONS_ADDRESSED_TO_THE_READER: readonly LabelSectionName[] = ["contraindications", "do_not_use", "ask_doctor"];
const CO_USE = /\b(?:co[- ]?administ\w*|concomitant\w*|in combination with|also taking|together with|patients? (?:taking|receiving|treated with)|(?:administer(?:ed)?|use[sd]?|tak(?:e|en)|given|contraindicated)(?:\s+(?!(?:to|in|for|patients?|people|women|children|adults|anyone|those|individuals?|persons?)\b)[\w-]+){0,8}\s+with)\b/i;
const TREATMENT_LEAD = /(?:\b(?:treat(?:s|ing|ment)?(?: of)?|management of|relief of|indicated for|used for|control of)\s+(?:the\s+)?|^uses?\s*:?\s*)(?:(?:type [12]|primary|essential|chronic|acute)\s+)*$/i;
// "1 INDICATIONS AND USAGE Hypothyroidism Levothyroxine ... is indicated": the condition is the first subheading.
const INDICATION_HEADING = /^\s*(?:\d+(?:\.\d+)*\s+)?indications?(?:\s+(?:and|&)\s+usage)?\s*:?\s*$/i;
const GLYCEMIC_CONTROL = /\bimprove glycemic control in [^.;:]{1,80}\bwith (?:type [12] )?$/i;

function treatsCondition(item: CabinetItem, condition: ConditionId): boolean {
  const pattern = conditionPattern(condition);
  return sectionSentences(item.label, "indications_and_usage").some((sentence) =>
    hitsIn(sentence, pattern).some(({ span }) => {
      const before = sentence.text.slice(0, span.start);
      return !/\bnot (?:indicated|used|intended)\b|\bdoes not treat\b/i.test(before)
        && (TREATMENT_LEAD.test(before) || INDICATION_HEADING.test(before) ||
          (condition === "diabetes" && GLYCEMIC_CONTROL.test(before)));
    }),
  );
}

function namesOtherMedicine(hit: PhraseHit, item: CabinetItem, cabinet: readonly CabinetItem[]): boolean {
  const text = hit.sentence.text;
  const start = text.search(CO_USE);
  // A passive subject can precede the co-use verb ("aliskiren must not
  // be administered with ..."). Keep it in the same clause as the verb.
  const subject = text.slice(0, start).split(/[;.!?,:]/).at(-1) ?? "";
  const object = text.slice(start).split(/[;.!?]|\bin patients with\b/i)[0] ?? "";
  const clause = `${subject} ${object}`;
  const ownNames = new Set(item.ingredients.flatMap(({ name, printedName }) =>
    [name, printedName ?? ""].map((value) => value.trim().toLowerCase())));
  return cabinet.some((other) => other.id !== item.id && other.ingredients.some((ingredient) => {
    if (ownNames.has(ingredient.name.trim().toLowerCase())) return false;
    return [other.displayName, ingredient.name, ingredient.printedName].some((name) =>
      name && !ownNames.has(name.trim().toLowerCase()) && termRegExp(name).test(clause));
  }));
}

function conditionFlags(item: CabinetItem, condition: ConditionId, cabinet: readonly CabinetItem[]): readonly Flag[] {
  if (treatsCondition(item, condition)) return [];
  const { label } = CONDITION_RULES[condition];
  const hits = firstHitPerSentence(item, CONDITION_SECTIONS, conditionPattern(condition)).filter((hit) => {
    if (hit.sentence.section !== "warnings_and_cautions") return true;
    const lead = hit.sentence.text.slice(0, hit.span.start);
    return /\bpatients? with\b[^.;:]{0,100}$/i.test(lead);
  });
  const isCombination = (hit: PhraseHit) => {
    if (!STRONGEST_FIRST.includes(hit.sentence.section)) return false;
    const coUse = CO_USE.exec(hit.sentence.text);
    if (!coUse) return false;
    // "Do not use with severe renal impairment" names a condition as the
    // object of 'with'. It does not require a second medicine.
    const end = coUse.index + coUse[0].length;
    return !(/\bwith$/i.test(coUse[0]) && end <= hit.span.start
      && /^\s*(?:(?:a history of|severe|moderate|mild|acute|chronic)\s+)*$/i.test(hit.sentence.text.slice(end, hit.span.start)));
  };
  const conditional = hits.find((hit) => isCombination(hit) && namesOtherMedicine(hit, item, cabinet));
  const independent = hits.filter((hit) => !isCombination(hit));
  if (conditional && !independent.some((hit) => severityForSection(hit.sentence.section) === "stop")) {
    const statement = `The ${item.displayName} label says “${conditional.sentence.text.replace(/[.!?]+$/, "")}”.`;
    return toFlag(item, [conditional, ...independent], {
      kind: "condition",
      term: condition,
      title: `${item.displayName} and ${label}`,
      about: label,
      severity: "ask",
      explain: statement,
      detail: `${statement} Your cabinet includes the other medicine named in this warning. Ask a pharmacist about this combination.`,
    });
  }
  const isAddressed = independent[0] !== undefined && SECTIONS_ADDRESSED_TO_THE_READER.includes(independent[0].sentence.section);
  return toFlag(item, independent, {
    kind: "condition",
    term: condition,
    title: `${item.displayName} and ${label}`,
    about: label,
    ...(!isAddressed ? { detail: `Your profile lists ${label}. The ${item.displayName} label mentions it in the quoted warning.` } : {}),
    explain: isAddressed
      ? `The ${item.displayName} label has a warning for people with ${label}, which is in your profile.`
      : `The warnings on the ${item.displayName} label mention ${label}, which is in your profile, so read the quoted line.`,
  });
}

function alcoholFlags(item: CabinetItem): readonly Flag[] {
  return toFlag(item, firstHitPerSentence(item, CONDITION_SECTIONS, ALCOHOL_PATTERN), {
    kind: "alcohol",
    term: "3 or more alcoholic drinks",
    title: `${item.displayName} and daily alcohol`,
    about: "having 3 or more alcoholic drinks every day",
    explain: `The ${item.displayName} label has a warning for people who have 3 or more alcoholic drinks every day.`,
  });
}

function pregnancyFlags(item: CabinetItem): readonly Flag[] {
  const hits = firstHitPerSentence(item, PREGNANCY_SECTIONS, PREGNANCY_PATTERN)
    .filter(({ sentence }) => !NEGATED_RESTRICTION.test(sentence.text)
      && (!REASSURING_PREGNANCY.test(sentence.text) || PREGNANCY_RESTRICTION.test(sentence.text)));
  const weekHits = item.ingredients.some(isNsaid)
    ? [...hits, ...firstHitPerSentence(item, ["information_for_patients", "spl_medguide"], PREGNANCY_PATTERN)]
      .filter(({ sentence }) => TWENTY_WEEKS.test(sentence.text) && !NEGATED_RESTRICTION.test(sentence.text))
    : [];
  const weekWarning = weekHits.find(({ sentence }) => PREGNANCY_RESTRICTION.test(sentence.text))
    ?? weekHits.find(({ sentence }) => FETAL_RISK.test(sentence.text));
  const wording = weekWarning
    ? `The ${item.displayName} label warns about use at 20 weeks or later in pregnancy. Read the quoted instruction.`
    : `The ${item.displayName} label has a warning about use during pregnancy.`;
  return toFlag(item, weekWarning ? [weekWarning, ...hits.filter((hit) => hit !== weekWarning)] : hits, {
    kind: "pregnancy",
    term: "pregnant",
    title: `${item.displayName} and pregnancy`,
    about: "pregnancy",
    explain: wording,
    ...(weekWarning ? { severity: "stop", detail: wording, fullPrimaryQuote: true } : {}),
  });
}

function breastfeedingFlags(item: CabinetItem): readonly Flag[] {
  return toFlag(item, firstHitPerSentence(item, BREASTFEEDING_SECTIONS, BREASTFEEDING_PATTERN), {
    kind: "breastfeeding",
    term: "breast-feeding",
    title: `${item.displayName} and breast-feeding`,
    about: "breast-feeding",
    explain: `The ${item.displayName} label has a warning about use while breast-feeding.`,
  });
}

function toAgeClause(hit: PhraseHit, kind: AgeClauseKind, groups: readonly (string | undefined)[]): AgeClause | undefined {
  const numbers = groups.map(Number).filter((value) => Number.isInteger(value));
  const instruction = groups.find((group) => group !== undefined && !/^\d+$/.test(group)) ?? "";
  const severity: Severity = DO_NOT_USE_WORDING.test(instruction) ? "stop" : "ask";
  const [first, second] = numbers;
  if (first === undefined) return undefined;
  if (kind === "or_older") return { hit, fromYears: first, belowYears: NO_UPPER_AGE, severity: "ask" };
  if (kind === "under" || kind === "not_intended_under") return { hit, fromYears: 0, belowYears: first, severity };
  if (second === undefined) return undefined;
  return { hit, fromYears: first, belowYears: kind === "from_to" ? second + 1 : second, severity };
}

function ageClausesIn(item: CabinetItem, sentence: LabelSentence): readonly AgeClause[] {
  const subjects = [item.displayName, ...item.ingredients.flatMap((ingredient) => [ingredient.name, ingredient.printedName])];
  const heading = /^(?:contraindications|pediatric use|dosage and administration|boxed warning|warnings?)\b\s*:?\s*/i;
  const withUnits = RESTRICTIONS_WITH_UNITS.flatMap((pattern) =>
    [...sentence.text.matchAll(pattern)].flatMap((match): AgeClause[] => {
      const { age, unit, instruction } = match.groups ?? {};
      const subject = sentence.text.slice(0, match.index).replace(heading, "").trim().toLowerCase();
      if (!age || !unit || !instruction) return [];
      const isNamedProduct = subjects.some((name) => {
        const named = name?.trim().toLowerCase();
        return !!named && (named === subject || (named.length > 3 && subject.includes(named) && subject.split(" ").length <= 8));
      });
      if (subject && !isNamedProduct && !/^(?:use|this product|this medicine)$/.test(subject)) return [];
      const hit = { sentence, span: { start: match.index, end: match.index + match[0].length }, text: match[0] };
      const threshold = /^\d/.test(age) ? Number(age) : AGE_WORDS.indexOf(age.toLowerCase());
      const belowYears = threshold / (/^month/i.test(unit) ? 12 : 1);
      const severity = /contraindicated|do not/i.test(instruction) ? "stop" : "ask";
      return [{ hit, fromYears: 0, belowYears, severity }];
    }),
  );
  if (sentence.section === "pediatric_use" || sentence.section === "contraindications" || sentence.section === "boxed_warning") {
    return withUnits;
  }
  const stated = AGE_CLAUSE_PATTERNS.flatMap(({ pattern, kind }) =>
    [...sentence.text.matchAll(pattern)].flatMap((found) => {
      const hit = { sentence, span: { start: found.index, end: found.index + found[0].length }, text: found[0] };
      return toAgeClause(hit, kind, found.slice(1)) ?? [];
    }),
  );
  if (sentence.section !== "do_not_use") return [...stated, ...withUnits];
  const implied = hitsIn(sentence, UNDER_AGE_IN_DO_NOT_USE).flatMap((hit): readonly AgeClause[] => {
    const belowYears = Number(/\d+/.exec(hit.text)?.[0]);
    return Number.isInteger(belowYears) ? [{ hit, fromYears: 0, belowYears, severity: "stop" }] : [];
  });
  return [...stated, ...withUnits, ...implied];
}

function ageFlags(item: CabinetItem, ageYears: number): readonly Flag[] {
  const applicable = AGE_SECTIONS.flatMap((section) =>
    sectionSentences(item.label, section).flatMap((sentence) => ageClausesIn(item, sentence)),
  ).filter(
    (clause) => ageYears >= clause.fromYears && ageYears < clause.belowYears,
  );
  const strictest = [...applicable].sort((left, right) => Number(right.severity === "stop") - Number(left.severity === "stop"));
  const [clause] = strictest;
  if (clause === undefined) return [];
  const below = /\bmonths?\b/i.test(clause.hit.text)
    ? `${formatNumber(clause.belowYears * 12)} months`
    : `${formatNumber(clause.belowYears)} years`;
  const range =
    clause.fromYears === 0
      ? `under ${below}`
      : clause.belowYears === NO_UPPER_AGE
        ? `age ${formatNumber(clause.fromYears)} or older`
        : `from ${formatNumber(clause.fromYears)} to under ${formatNumber(clause.belowYears)} years`;
  const isRiskFactor = clause.belowYears === NO_UPPER_AGE;
  const higherRisk = /\b(?:chance|risk) is (?:higher|greater|increased)\b/i.test(clause.hit.sentence.text);
  const riskWording = higherRisk
    ? `The ${item.displayName} label says the risk is higher for people ${range}.`
    : `The ${item.displayName} label mentions people ${range} in the quoted line.`;
  return toFlag(
    item,
    strictest.map((entry) => entry.hit),
    {
      kind: "age",
      term: range,
      title: `${item.displayName} and age ${formatNumber(ageYears)}`,
      about: isRiskFactor ? `people ${range}` : `an age limit for people ${range}`,
      ...(isRiskFactor ? { detail: riskWording } : {}),
      explain: isRiskFactor
        ? riskWording
        : clause.severity === "stop"
          ? `The ${item.displayName} label says do not use it for people ${range}, and the age in your profile is ${formatNumber(ageYears)}.`
          : `The ${item.displayName} label says to ask a doctor first for people ${range}, and the age in your profile is ${formatNumber(ageYears)}.`,
      severity: clause.severity,
      numbers: { ageYears, fromYears: clause.fromYears, belowYears: clause.belowYears },
    },
  );
}

function allergenInIngredients(item: CabinetItem, allergen: string, pattern: RegExp): readonly Flag[] {
  return toFlag(item, firstHitPerSentence(item, INGREDIENT_SECTIONS, pattern), {
    kind: "allergen",
    term: allergen,
    title: `${item.displayName} contains ${allergen}`,
    about: `${allergen} as an ingredient`,
    explain: `${item.displayName} lists ${allergen} in its ingredients, and your profile lists an allergy to ${allergen}.`,
    severity: "stop",
  });
}

function structuredAllergen(item: CabinetItem, allergen: string): readonly Flag[] {
  if (!item.productNdc && !item.dsldId) return [];
  const normalized = allergen.toLowerCase();
  for (const ingredient of item.ingredients) {
    const names = [ingredient.name, ingredient.printedName, ...(ingredient.commonNames ?? [])];
    const matched = names.find((name) => name?.trim().toLowerCase() === normalized);
    if (!matched) continue;
    const text = ingredient.printedName ?? matched;
    const section = ingredient.printedName
      ? (item.dsldId ? "dsld_ingredient" : "ndc_active_ingredient")
      : "normalized_active_ingredient";
    const record = item.dsldId ? `DSLD ${item.dsldId}` : `NDC ${item.productNdc}`;
    const detail = `The ingredient record for ${item.displayName} (${record}) lists “${text}”, matching your allergy to ${allergen}.`;
    return [{
      type: "profile",
      severity: "stop",
      itemIds: [item.id],
      title: `${item.displayName} contains ${allergen}`,
      detail,
      explain: detail,
      match: { text: matched, term: allergen, kind: "allergen" },
      quote: toQuote(item.id, { text, section }),
    }];
  }
  return [];
}

function declaredAllergen(item: CabinetItem, allergen: string, pattern: RegExp): readonly Flag[] {
  if (item.kind !== "supplement") return [];
  const sections: readonly LabelSectionName[] = ["dsld_contains", "dsld_allergy_precautions", "warnings"];
  const hits = firstHitPerSentence(item, sections, pattern).filter(({ sentence }) => {
    const contents = /^contains\b\s*:?\s*(.+?)[.]?$/i.exec(sentence.text)?.[1];
    if (!contents || UNCERTAIN_OR_NEGATIVE_DECLARATION.test(contents)) return false;
    const names = contents.split(/[,;()&]|\band\b/i);
    return names.some((name) => name.trim().toLowerCase() === allergen.toLowerCase());
  });
  return toFlag(item, hits, {
    kind: "allergen",
    term: allergen,
    title: `${item.displayName} contains ${allergen}`,
    about: `${allergen} in its Contains declaration`,
    severity: "stop",
    explain: `The ${item.displayName} label declares ${allergen}, which your profile lists as an allergy.`,
  });
}

function namesAllergen(hit: PhraseHit): boolean {
  const { text } = hit.sentence;
  if (!ALLERGY_WORDING.test(text) || NEGATED_ALLERGY.test(text)) return false;
  const before = text.slice(0, hit.span.start).replace(/\([^()]*\)/g, "").replace(/\be\.g\.,?\s*/gi, "including ").replace(/\s+/g, " ");
  const after = text.slice(hit.span.end);
  // Flattened contraindication lists can contain both a drug name and an
  // unrelated allergy. Require the allergen to be an object of the reaction.
  return /\b(?:allerg\w*|hypersensitiv\w*|anaphyla\w*)(?:-type)?(?:\s+reactions?)?\s+(?:to|from|after|following|with)\s+(?:any\s+)?(?:other\s+)?$/i.test(before)
    || /\b(?:allerg\w*|hypersensitiv\w*)[^.;]{0,80}\bmembers? of (?:the )?$/i.test(before)
    || /\bangioedema\b[^.;]{0,80}\b(?:with|to)\s+(?:an?\s+)?$/i.test(before)
    || /\b(?:allerg\w*|hypersensitiv\w*|anaphyla\w*)(?:\s+reactions?)?\s+to\s+[^.;:]{1,140}(?:\b(?:and|or)\s+(?:to\s+)?(?:other\s+)?|including\s+)$/i.test(before)
    || /^\s+(?:may|can) cause (?:an? )?(?:severe |serious )?(?:allergic|anaphylactic) reaction\b/i.test(after);
}

function allergenInAllergyWarning(item: CabinetItem, allergen: string, pattern: RegExp): readonly Flag[] {
  const hits = ALLERGY_WARNING_SECTIONS.flatMap((section) => sectionSentences(item.label, section)
    .flatMap((sentence) => hitsIn(sentence, pattern).filter(namesAllergen).slice(0, 1)));
  // "Patients allergic to sulfonamides may also be allergic to furosemide" is a caution, not a contraindication.
  const onlyMay = hits.length > 0 && hits.every((hit) => /\bmay (?:also )?be (?:allergic|hypersensitive)|\bcross[- ]?(?:sensitiv|hypersensitiv|reactiv)/i.test(hit.sentence.text) &&
    !/\bcontraindicated\b|\bdo not (?:use|take)\b/i.test(hit.sentence.text));
  if (onlyMay) return crossSensitivity(item, allergen, pattern).length ? crossSensitivity(item, allergen, pattern) : toFlag(item, hits, {
    kind: "allergen", term: allergen, title: `${item.displayName} and an allergy to ${allergen}`, about: `an allergy to ${allergen}`,
    severity: "ask" as const,
    explain: `The ${item.displayName} label warns that people with an allergy to ${allergen} may also react to it.`,
  });
  return toFlag(item, hits, {
    kind: "allergen",
    term: allergen,
    title: `${item.displayName} and an allergy to ${allergen}`,
    about: `an allergy to ${allergen}`,
    ...(item.kind === "rx" || item.kind === "otc" ? { severity: "stop" as const } : {}),
    explain: `The ${item.displayName} label has an allergy warning that names ${allergen}, and your profile lists an allergy to ${allergen}.`,
  });
}

function familyAllergen(item: CabinetItem, allergen: string): readonly Flag[] {
  if (item.kind !== "rx" && item.kind !== "otc") return [];
  for (const ingredient of item.ingredients) {
    const family = allergyFamily(ingredient, allergen);
    if (!family) continue;
    const text = ingredient.printedName ?? ingredient.name;
    const [labelHit] = firstHitPerSentence(item, ["active_ingredient"], termRegExp(ingredient.name));
    if (!labelHit && !item.productNdc && !item.verified) continue;
    const quote = labelHit ? quoteOf(item, labelHit) : toQuote(item.id, {
      text: item.productNdc ? text : ingredient.name,
      section: item.productNdc && ingredient.printedName ? "ndc_active_ingredient" : "normalized_active_ingredient",
    });
    const explain = `${item.displayName} contains ${ingredient.name}, ${family}. Your profile lists an allergy to ${allergen}. Check with the pharmacy before the next dose.`;
    return [{
      type: "profile", severity: "stop", itemIds: [item.id],
      title: `${item.displayName} and an allergy to ${allergen}`,
      detail: explain, explain, quote,
      match: { text: labelHit?.text ?? quote.text, term: allergen, kind: "allergen", ingredient: ingredient.name },
    }];
  }
  return [];
}

function allergyFlags(item: CabinetItem, allergen: string): readonly Flag[] {
  const pattern = termRegExp(allergen);
  const inIngredients = allergenInIngredients(item, allergen, pattern);
  if (inIngredients.length) return inIngredients;
  const structured = structuredAllergen(item, allergen);
  if (structured.length) return structured;
  const declared = declaredAllergen(item, allergen, pattern);
  if (declared.length) return declared;
  const warning = allergenInAllergyWarning(item, allergen, pattern);
  if (warning.length) return warning;
  const family = familyAllergen(item, allergen);
  if (family.length) return family;
  const otherPainReliever = otherPainRelieverAllergy(item, allergen);
  if (otherPainReliever.length) return otherPainReliever;
  const cross = crossSensitivity(item, allergen, pattern);
  if (cross.length) return cross;
  // The label may name the allergy's family rather than the word typed.
  const familyWords = familyLabelWords(allergen);
  if (!familyWords) return [];
  const byFamily = allergenInAllergyWarning(item, allergen, new RegExp(familyWords.source, "gi"));
  return byFamily.length ? byFamily : crossSensitivity(item, allergen, new RegExp(familyWords.source, "gi"));
}

// "patients with a history of penicillin allergy" or "penicillin-sensitive patients":
// the label warns that people allergic to the named drug may react to this one.
function crossSensitivity(item: CabinetItem, allergen: string, pattern: RegExp): readonly Flag[] {
  if (item.kind !== "rx" && item.kind !== "otc") return [];
  const [hit] = ALLERGY_WARNING_SECTIONS.flatMap((section) => sectionSentences(item.label, section)
    .flatMap((sentence) => hitsIn(sentence, pattern)
      .filter((candidate) => /^[\s-]*(?:allerg(?:y|ies)|hypersensitivity|sensitive)\b/i.test(sentence.text.slice(candidate.span.end)))
      .slice(0, 1)));
  if (!hit) return [];
  const explain = `Your profile lists an allergy to ${allergen}. The ${item.displayName} label warns that people with that allergy may also react to it.`;
  return [{
    type: "profile", severity: "ask", itemIds: [item.id],
    title: `${item.displayName} and an allergy to ${allergen}`,
    detail: explain, explain, quote: quoteOf(item, hit),
    match: { text: hit.text, term: allergen, kind: "allergen" },
  }];
}

// OTC NSAID labels say not to use them after an allergic reaction to any other pain reliever.
function otherPainRelieverAllergy(item: CabinetItem, allergen: string): readonly Flag[] {
  if (!isNsaidName(allergen) || !item.ingredients.some(isNsaid)) return [];
  const [hit] = firstHitPerSentence(item, ["do_not_use", "warnings"], /\ballergic reaction to (?:any )?other pain relievers?(?:\/fever reducers?)?/i);
  if (!hit) return [];
  const explain = `Your profile lists an allergy to ${allergen}. The ${item.displayName} label says not to use it if you have had an allergic reaction to any other pain reliever.`;
  return [{
    type: "profile", severity: "stop", itemIds: [item.id],
    title: `${item.displayName} and an allergy to ${allergen}`,
    detail: explain, explain, quote: quoteOf(item, hit),
    match: { text: hit.text, term: allergen, kind: "allergen" },
  }];
}

function validated(profile: HealthProfile): HealthProfile {
  const { ageYears } = profile;
  if (ageYears !== undefined && (!Number.isFinite(ageYears) || ageYears < 0)) {
    throw new InvalidProfileError(`ageYears must be zero or more, got ${ageYears}`);
  }
  const unknown = profile.conditions.find((condition) => !CONDITION_IDS.includes(condition));
  if (unknown !== undefined) throw new InvalidProfileError(`"${String(unknown)}" is not a supported condition`);
  return profile;
}

function unique<T>(values: readonly T[]): readonly T[] {
  return [...new Set(values)];
}

const REYE_MAX_AGE = 19;

// Aspirin and other salicylate labels warn children and teenagers about Reye's syndrome without an age number.
function reyeFlags(item: CabinetItem, ageYears: number): readonly Flag[] {
  if (ageYears >= REYE_MAX_AGE) return [];
  const [hit] = firstHitPerSentence(item, ["do_not_use", "warnings", "ask_doctor", "boxed_warning"], /\breye['’]?s syndrome\b/i);
  if (!hit) return [];
  const explain = `The ${item.displayName} label warns children and teenagers about Reye's syndrome, a rare but serious illness, and the age in your profile is ${formatNumber(ageYears)}.`;
  return [{
    type: "profile", severity: "ask", itemIds: [item.id],
    title: `${item.displayName} and Reye's syndrome`,
    detail: explain, explain, quote: quoteOf(item, hit),
    match: { text: hit.text, term: "Reye's syndrome", kind: "age" },
  }];
}

function flagsForItem(item: CabinetItem, profile: HealthProfile, cabinet: readonly CabinetItem[]): readonly Flag[] {
  const allergens = unique(profile.allergies.map((allergen) => allergen.trim()).filter((allergen) => allergen !== ""));
  return [
    ...allergens.flatMap((allergen) => allergyFlags(item, allergen)),
    ...unique(profile.conditions).flatMap((condition) => conditionFlags(item, condition, cabinet)),
    ...(profile.drinksThreeOrMoreDaily === true ? alcoholFlags(item) : []),
    ...(profile.pregnant === true ? pregnancyFlags(item) : []),
    ...(profile.breastfeeding === true ? breastfeedingFlags(item) : []),
    ...(profile.ageYears === undefined ? [] : ageFlags(item, profile.ageYears)),
    ...(profile.ageYears === undefined ? [] : reyeFlags(item, profile.ageYears)),
  ];
}

export function profileFlags(items: readonly CabinetItem[], profile: HealthProfile): readonly Flag[] {
  const checked = validated(profile);
  return items.flatMap((item) => flagsForItem(item, checked, items));
}

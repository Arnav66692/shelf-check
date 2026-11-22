import { searchTermsFor } from "../classPhrases.ts";
import type { SearchTerm } from "../classPhrases.ts";
import { isNutritionIngredient } from "../supplementNames.ts";
import { sectionSentences, sectionTitle, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { termRegExp } from "../text.ts";
import type { TextSpan } from "../text.ts";
import type { CabinetItem, DrugClass, Flag, InteractionMatchKind, LabelSectionName, TermMatch } from "../types.ts";
import { severityForSection } from "./severity.ts";

export const INTERACTION_SECTIONS: readonly LabelSectionName[] = [
  "drug_interactions",
  "boxed_warning",
  "warnings",
  "warnings_and_cautions",
  "contraindications",
  "do_not_use",
  "ask_doctor",
  "ask_doctor_or_pharmacist",
  "when_using",
];

// Sections whose only subject is taking this product with something else.
export const CO_USE_SECTIONS: readonly LabelSectionName[] = ["drug_interactions", "ask_doctor_or_pharmacist"];

// Wording that says the sentence is about taking two things together.
export const CO_USE_CUE =
  /\b(?:tak(?:e|es|en|ing)|concomitant(?:ly)?|concurrent(?:ly)?|co-?administ(?:er|ered|ration)|in combination with|combined with|together with|along with|with other|used? with|receiving|interact(?:s|ions?)?|potentiates?|contraindicated|avoid(?:ed)?|do not (?:use|take)|may (?:increase|enhance|decrease|reduce))\b/i;

const CLAUSE_BREAK = /;|(?=\b(?:heart attack and stroke|stomach bleeding|allergy) (?:alert|warning)\b)|\bbut\b(?! particularly with)|\b(?:whereas|however|although|nevertheless)\b|,?\s+(?:and|or)\s+(?=(?:avoid|do not|monitor|ask|use caution|no |there (?:is|are)|if (?:you are )?allergic))/gi;
const ALLERGY = /\ballerg(?:y|ic|ies)\b/i;
const PROHIBITION = /\b(?:do|should|must) not (?:be (?:combined|co-?administered|taken|used|given)|take|use|administer|co-?administer|combine)\b/gi;
const UNRESOLVED_POLARITY = /\b(?:no|not|neither|nor|never|without|lack(?:s|ed|ing)?|unknown|unclear|unaffected|unnecessary|except(?:ion|ing)?|excluding|other than|rather than|instead of|compared (?:to|with)|alone(?! but particularly with)|monotherapy)\b/i;
const WARNING = /\b(?:avoid|(?:do|should|must) not (?:be (?:combined|co-?administered|taken|used)|take|use|administer|co-?administer|combine)|contraindicated|monitor|caution|ask (?:a |your )?(?:doctor|pharmacist)|potentiat\w*|interacts? with|(?:may|can|could) (?:increase|enhance|decrease|reduce|affect|interact)|(?:increas\w*|reduc\w*) (?:the )?(?:risk|effect|clearance|exposure|concentration)|may result in deterioration|life-threatening|synergism|antagonism)\b/i;
const SERIOUS_HARM = /\b(?:fatal|death|life[- ]threatening|respiratory depression|serotonin syndrome|(?:serious|severe|major) (?:[\w-]+ ){0,2}bleeding)\b/i;
const AVOID_COMBINATION = /\b(?:avoid(?:ed)?|contraindicated|do not (?:use|take)|should not be (?:used|taken|given))\b/i;
const RISK_REDUCTION = /\b(?:prevent(?:s|ed|ion of)?|(?:reduc(?:e[ds]?|tion)|lower(?:s|ed)?) (?:of |in )?(?:the )?(?:risk|incidence) of|to avoid)\s*$/i;
const AVOID_OTHER_TARGET = /\bavoid\s+([^,;]+?)\s+(?:(?:while|when|if)\s+(?:(?:you|patients?)\s+(?:are\s+)?)?(?:taking|using|receiving)|during treatment with)\b/i;
const AVOID_AFTER_CONDITION = /\b(?:while|when|if)\s+(?:(?:you|patients?)\s+(?:are\s+)?)?(?:taking|using|receiving)\b[^,;]+,\s*avoid\s+([^.;]+)/i;
// A generic insulin warning can apply to an analogue. Require administration
// wording, and a standalone class noun rather than a lab measure or a named analogue.
const INSULIN_CONTEXT = /\b(?:with|taking|using|receiving|administered|dose of|use of|or|plus)\s+(?:an?\s+)?$/i;
const INSULIN_END = /^\s*(?:$|[),.;:\]]|\b(?:may|might|can|could|should|must|is|are|increases?|raises?|to (?:reduce|avoid)|and|or)\b)/i;
const KIND_RANK: Readonly<Record<InteractionMatchKind, number>> = {
  ingredient_name: 0,
  common_name: 1,
  class_name: 2,
  class_phrase: 3,
};

interface CompiledTerm extends SearchTerm {
  readonly pattern: RegExp;
}

interface FoundMatch {
  readonly text: string;
  readonly kind: InteractionMatchKind;
  readonly ingredient: string;
}

interface SentenceMatch {
  readonly sentence: LabelSentence;
  readonly sentenceIndex: number;
  readonly span: TextSpan;
  readonly found: FoundMatch;
  readonly match: TermMatch;
  readonly serious: boolean;
  readonly drugClass?: DrugClass;
}

export function isAboutCoUse(sentence: LabelSentence): boolean {
  return CO_USE_SECTIONS.includes(sentence.section) || CO_USE_CUE.test(sentence.text);
}

function termsAbout(other: CabinetItem, labelOwner: CabinetItem): readonly CompiledTerm[] {
  const ownNames = new Set(labelOwner.ingredients.map((ingredient) => ingredient.name.toLowerCase()));
  return other.ingredients
    .filter((ingredient) => other.kind !== "supplement" || !isNutritionIngredient(ingredient))
    .filter((ingredient) => !ownNames.has(ingredient.name.toLowerCase()))
    .flatMap(searchTermsFor)
    .map((term) => ({ ...term, pattern: new RegExp(termRegExp(term.term).source, "gi") }));
}

function firstAllowedSpan(text: string, term: CompiledTerm): TextSpan | undefined {
  return [...text.matchAll(term.pattern)]
    .map((hit) => ({ start: hit.index, end: hit.index + hit[0].length }))
    .find((span) => {
      const after = text.slice(span.end);
      if (term.notFollowedBy?.test(after)) return false;
      if (/^insulins?$/i.test(term.term)) {
        return INSULIN_CONTEXT.test(text.slice(0, span.start)) && INSULIN_END.test(after);
      }
      return true;
    });
}

function namesLabelOwner(text: string, owner: CabinetItem): boolean {
  return /\bthis (?:product|medicine|medication|drug)\b/i.test(text) ||
    [owner.displayName, ...owner.ingredients.map((ingredient) => ingredient.name)].some((name) => termRegExp(name).test(text));
}

function matchesIn(sentence: LabelSentence, sentenceIndex: number, terms: readonly CompiledTerm[], owner: CabinetItem): readonly SentenceMatch[] {
  const matches: SentenceMatch[] = [];
  // Commas often separate members of a drug list under a single warning.
  let nextOffset = 0;
  for (const text of sentence.text.split(CLAUSE_BREAK)) {
    const offset = sentence.text.indexOf(text, nextOffset);
    nextOffset = offset + text.length;
    if (ALLERGY.test(text) || UNRESOLVED_POLARITY.test(text.replace(PROHIBITION, ""))) continue;
    const harm = SERIOUS_HARM.exec(text);
    const prohibition = AVOID_COMBINATION.test(text.replace(/\bto avoid\b/gi, ""));
    if (harm && !prohibition && RISK_REDUCTION.test(text.slice(0, harm.index))) continue;
    const hasCoUseCue = CO_USE_CUE.test(text) || prohibition;
    const coUse = hasCoUseCue || sentence.section === "drug_interactions";
    const serious = Boolean(harm) || prohibition ||
      sentence.drugFactsInstruction === "do_not_use" || sentence.section === "do_not_use";
    const instruction = (coUse && WARNING.test(text)) || (hasCoUseCue && serious) ||
      (sentence.section === "ask_doctor_or_pharmacist" && hasCoUseCue) ||
      (/\b(?:the chance is higher if|risk is (?:higher|increased) if)\b/i.test(text) && hasCoUseCue);
    if (!instruction) continue;
    const otherTarget = AVOID_OTHER_TARGET.exec(text);
    const afterCondition = AVOID_AFTER_CONDITION.exec(text);
    for (const term of terms) {
      const local = firstAllowedSpan(text, term);
      if (!local) continue;
      if (otherTarget?.[1] && local.start >= otherTarget.index + otherTarget[0].length && !namesLabelOwner(otherTarget[1], owner)) continue;
      if (afterCondition?.[1] && local.end <= afterCondition.index + afterCondition[0].indexOf(",") && !namesLabelOwner(afterCondition[1], owner)) continue;
      const span = { start: offset + local.start, end: offset + local.end };
      const found = { text: text.slice(local.start, local.end), kind: term.kind, ingredient: term.ingredient };
      matches.push({ sentence, sentenceIndex, span, found, serious, match: { ...found, term: term.term },
        ...(term.drugClass ? { drugClass: term.drugClass } : {}) });
    }
  }
  return matches;
}

function bestMatch(matches: readonly SentenceMatch[]): SentenceMatch | undefined {
  return matches.reduce<SentenceMatch | undefined>((best, candidate) => {
    if (best === undefined) return candidate;
    if (candidate.serious !== best.serious) return candidate.serious ? candidate : best;
    const rankGap = KIND_RANK[candidate.found.kind] - KIND_RANK[best.found.kind];
    const isBetter = rankGap < 0 || (rankGap === 0 && candidate.sentenceIndex < best.sentenceIndex);
    return isBetter ? candidate : best;
  }, undefined);
}

function linkFor(other: CabinetItem, match: FoundMatch): string {
  if (match.kind === "ingredient_name") return `names ${match.ingredient}, which is in ${other.displayName}`;
  if (match.kind === "common_name") {
    return `names "${match.text}". ${other.displayName} lists ${match.ingredient} under that name`;
  }
  return `mentions "${match.text}". ${other.displayName} contains ${match.ingredient}, which RxClass lists in that drug group`;
}

function describe(labelOwner: CabinetItem, other: CabinetItem, section: LabelSectionName, match: FoundMatch): string {
  const where = `the "${sectionTitle(section)}" section of the ${labelOwner.displayName} label`;
  return `${where.charAt(0).toUpperCase()}${where.slice(1)} ${linkFor(other, match)}. Ask a pharmacist or doctor before taking both.`;
}

function explain(labelOwner: CabinetItem, other: CabinetItem, match: FoundMatch): string {
  const named = match.kind === "ingredient_name" ? match.ingredient : `"${match.text}"`;
  return `The ${labelOwner.displayName} label mentions ${named} in this warning, so ask a pharmacist whether it applies to taking ${other.displayName} with it.`;
}

function classExplanation(other: CabinetItem, best: SentenceMatch): string | undefined {
  if (!best.drugClass) return undefined;
  const { ingredient, text } = best.found;
  // This OTC warning identifies a particular member by name. Make the distinction
  // explicit without applying a bare mention of warfarin to other anticoagulants.
  if (/^blood[- ]thinning$/i.test(text) && /^\s+drug\s+warfarin\b/i.test(best.sentence.text.slice(best.span.end))) {
    return `${other.displayName} contains ${ingredient}, a blood thinner. The label names warfarin, another blood thinner.`;
  }
  return `RxClass lists ${ingredient} in ${other.displayName} under “${best.drugClass.name}”. The label mentions “${text}”.`;
}

// OTC Drug Facts often puts the consequence just before "The chance is higher if".
// Keep that antecedent only when the two lines are contiguous on this label.
function withBleedingContext(match: SentenceMatch, previous: LabelSentence | undefined, paragraphs: readonly string[]): SentenceMatch {
  if (!previous || !/^The (?:chance|risk) is higher if\b/i.test(match.sentence.text) ||
      !/\bmay cause (?:severe|serious) stomach bleeding\.$/i.test(previous.text)) return match;
  const end = match.sentence.text.search(/\s+(?:heart attack and stroke|allergy) (?:warning|alert)\b/i);
  const risks = end < 0 ? match.sentence.text : match.sentence.text.slice(0, end);
  const text = `${previous.text} ${risks}`;
  if (match.span.end > risks.length || !paragraphs.some((paragraph) => paragraph.includes(text))) return match;
  const offset = previous.text.length + 1;
  return { ...match, serious: true, sentence: { ...match.sentence, text }, span: { start: offset + match.span.start, end: offset + match.span.end } };
}

function flagForSection(
  labelOwner: CabinetItem,
  other: CabinetItem,
  section: LabelSectionName,
  terms: readonly CompiledTerm[],
): readonly Flag[] {
  const sentences = sectionSentences(labelOwner.label, section);
  const matches = sentences.flatMap((sentence, index) =>
    matchesIn(sentence, index, terms, labelOwner).map((match) =>
      withBleedingContext(match, sentences[index - 1], labelOwner.label?.[section] ?? [])),
  );
  const best = bestMatch(matches);
  if (best === undefined) return [];
  const matchedBecause = classExplanation(other, best);
  const quote = toQuote(labelOwner.id, best.sentence, best.span);
  // When the named drug and serious consequence are far apart, preserve both.
  const showsDanger = SERIOUS_HARM.test(quote.excerpt) || AVOID_COMBINATION.test(quote.excerpt);
  const needsFullWarning = best.serious && !showsDanger && (SERIOUS_HARM.test(quote.text) || AVOID_COMBINATION.test(quote.text));
  return [
    {
      type: "interaction",
      severity: best.serious ? "stop" : severityForSection(section),
      itemIds: [labelOwner.id, other.id],
      title: `${labelOwner.displayName} and ${other.displayName}`,
      detail: describe(labelOwner, other, section, best.found),
      explain: explain(labelOwner, other, best.found),
      quote: needsFullWarning ? { ...quote, excerpt: quote.text } : quote,
      match: best.match,
      ...(matchedBecause ? { matchedBecause } : {}),
    },
  ];
}

function flagsForPair(labelOwner: CabinetItem, other: CabinetItem): readonly Flag[] {
  const terms = termsAbout(other, labelOwner);
  if (terms.length === 0) return [];
  return INTERACTION_SECTIONS.flatMap((section) => flagForSection(labelOwner, other, section, terms));
}

export function interactionFlags(items: readonly CabinetItem[]): readonly Flag[] {
  return items.flatMap((labelOwner) =>
    items.filter((other) => other.id !== labelOwner.id).flatMap((other) => flagsForPair(labelOwner, other)),
  );
}

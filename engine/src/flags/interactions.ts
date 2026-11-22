import { searchTermsFor } from "../classPhrases.ts";
import type { SearchTerm } from "../classPhrases.ts";
import { sectionSentences, sectionTitle, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { termRegExp } from "../text.ts";
import type { TextSpan } from "../text.ts";
import type { CabinetItem, Flag, InteractionMatchKind, LabelSectionName, TermMatch } from "../types.ts";
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

// A drug's own name is specific. A group word or an everyday name ("antihistamines", "calcium") also turns up
// where a label talks about treatment or lab values, so it only counts next to co-use wording.
const KINDS_NEEDING_CO_USE: readonly InteractionMatchKind[] = ["common_name", "class_name", "class_phrase"];

// A sentence about being allergic to a drug is not about taking two drugs together.
const ALLERGY_SENTENCE = /\ballerg(?:y|ic|ies)\b/i;
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
}

export function isAboutCoUse(sentence: LabelSentence): boolean {
  return CO_USE_SECTIONS.includes(sentence.section) || CO_USE_CUE.test(sentence.text);
}

function termsAbout(other: CabinetItem, labelOwner: CabinetItem): readonly CompiledTerm[] {
  const ownNames = new Set(labelOwner.ingredients.map((ingredient) => ingredient.name.toLowerCase()));
  return other.ingredients
    .filter((ingredient) => !ownNames.has(ingredient.name.toLowerCase()))
    .flatMap(searchTermsFor)
    .map((term) => ({ ...term, pattern: new RegExp(termRegExp(term.term).source, "gi") }));
}

function firstAllowedSpan(text: string, term: CompiledTerm): TextSpan | undefined {
  return [...text.matchAll(term.pattern)]
    .map((hit) => ({ start: hit.index, end: hit.index + hit[0].length }))
    .find((span) => term.notFollowedBy === undefined || !term.notFollowedBy.test(text.slice(span.end)));
}

function matchesIn(sentence: LabelSentence, sentenceIndex: number, terms: readonly CompiledTerm[]): readonly SentenceMatch[] {
  if (ALLERGY_SENTENCE.test(sentence.text)) return [];
  const coUse = isAboutCoUse(sentence);
  return terms
    .filter((term) => coUse || !KINDS_NEEDING_CO_USE.includes(term.kind))
    .flatMap((term) => {
      const span = firstAllowedSpan(sentence.text, term);
      if (span === undefined) return [];
      const text = sentence.text.slice(span.start, span.end);
      const found: FoundMatch = { text, kind: term.kind, ingredient: term.ingredient };
      return [{ sentence, sentenceIndex, span, found, match: { ...found, term: term.term } }];
    });
}

function bestMatch(matches: readonly SentenceMatch[]): SentenceMatch | undefined {
  return matches.reduce<SentenceMatch | undefined>((best, candidate) => {
    if (best === undefined) return candidate;
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
  return `The ${labelOwner.displayName} label has a warning about ${named}, and that covers ${other.displayName}, so check with a pharmacist before taking both.`;
}

function flagForSection(
  labelOwner: CabinetItem,
  other: CabinetItem,
  section: LabelSectionName,
  terms: readonly CompiledTerm[],
): readonly Flag[] {
  const matches = sectionSentences(labelOwner.label, section).flatMap((sentence, index) =>
    matchesIn(sentence, index, terms),
  );
  const best = bestMatch(matches);
  if (best === undefined) return [];
  return [
    {
      type: "interaction",
      severity: severityForSection(section),
      itemIds: [labelOwner.id, other.id],
      title: `${labelOwner.displayName} and ${other.displayName}`,
      detail: describe(labelOwner, other, section, best.found),
      explain: explain(labelOwner, other, best.found),
      quote: toQuote(labelOwner.id, best.sentence, best.span),
      match: best.match,
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

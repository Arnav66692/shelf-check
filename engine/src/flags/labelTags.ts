import { sectionSentences, sectionTitle, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { spanOf } from "../text.ts";
import type { TextSpan } from "../text.ts";
import type { CabinetItem, Flag, LabelSectionName, LabelTag, Severity } from "../types.ts";
import { severityForSection } from "./severity.ts";

export const LABEL_TAGS: readonly LabelTag[] = ["alcohol", "grapefruit", "drowsiness", "sun"];

const STOP_SECTIONS: readonly LabelSectionName[] = ["boxed_warning", "contraindications", "do_not_use"];

export const LABEL_TAG_SECTIONS: readonly LabelSectionName[] = [
  ...STOP_SECTIONS,
  "when_using",
  "ask_doctor",
  "ask_doctor_or_pharmacist",
  "warnings",
  "warnings_and_cautions",
  "drug_interactions",
  "information_for_patients",
];

interface TagRule {
  readonly about: string;
  readonly pattern: RegExp;
  readonly exclude?: RegExp;
}

// "Benzyl alcohol" and the like are ingredients, and "alcohol-free" is a product claim. Neither is a line about drinking.
const ALCOHOL_PATTERN =
  /(?<!\b(?:benzyl|cetyl|stearyl|cetostearyl|isopropyl|polyvinyl|lanolin|rubbing|sugar)\s)\balcohol(?:ic(?!\s+patients))?\b(?![- ]free)/i;
const DROWSINESS_PATTERN =
  /\bdrows(?:y|iness)\b|\bsleepiness\b|\bdriv(?:e|ing)\s+(?:a\s+)?(?:motor\s+)?(?:vehicle|car)\b|\boperat(?:e|ing)\s+(?:\w+\s+)?machine(?:s|ry)?\b|\bmachinery\b/i;
const SUN_PATTERN = /\b(?:sunburn(?:s|ed)?|sunlamps?|sunscreens?|photosensitiv(?:e|ity)|tanning|ultraviolet|UV radiation)\b|\bprotect (?:your |the )?skin from (?:the )?sun(?:light)?\b/i;
const DEVICE_OR_STORAGE = /\b(?:pump|tubing|housing|vial|packaging|container|storage|store[ds]?)\b/i;

export const LABEL_TAG_RULES: Readonly<Record<LabelTag, TagRule>> = {
  alcohol: { about: "alcohol", pattern: ALCOHOL_PATTERN },
  grapefruit: { about: "grapefruit", pattern: /\bgrapefruit\b/i },
  drowsiness: {
    about: "drowsiness, driving or operating machinery",
    pattern: DROWSINESS_PATTERN,
    exclude: /\bhypoglyc(?:emia|aemia) (?:can|may) impair\b/i,
  },
  sun: { about: "sun or sunlight", pattern: SUN_PATTERN, exclude: DEVICE_OR_STORAGE },
};

interface TagHit {
  readonly sentence: LabelSentence;
  readonly span: TextSpan;
}

function firstHit(item: CabinetItem, { pattern, exclude }: TagRule): TagHit | undefined {
  for (const section of LABEL_TAG_SECTIONS) {
    for (const sentence of sectionSentences(item.label, section)) {
      if (exclude?.test(sentence.text)) continue;
      const span = spanOf(pattern, sentence.text);
      if (span !== undefined) return { sentence, span };
    }
  }
  return undefined;
}

function severityOf(section: LabelSectionName): Severity {
  return STOP_SECTIONS.includes(section) ? severityForSection(section) : "info";
}

function tagFlag(item: CabinetItem, tag: LabelTag): readonly Flag[] {
  const { about } = LABEL_TAG_RULES[tag];
  const hit = firstHit(item, LABEL_TAG_RULES[tag]);
  if (hit === undefined) return [];
  const { section, text } = hit.sentence;
  const matched = text.slice(hit.span.start, hit.span.end);
  return [
    {
      type: "label_tag",
      severity: severityOf(section),
      itemIds: [item.id],
      title: `${item.displayName} label mentions ${about}`,
      detail: `The "${sectionTitle(section)}" section of the ${item.displayName} label has a line about ${about} ("${matched}"). Read the quoted line.`,
      explain: `The ${item.displayName} label has a line about ${about}.`,
      quote: toQuote(item.id, hit.sentence, hit.span),
      match: { text: matched, term: tag, kind: "label_tag" },
      tag,
    },
  ];
}

export function labelTagFlags(items: readonly CabinetItem[]): readonly Flag[] {
  return items.flatMap((item) => LABEL_TAGS.flatMap((tag) => tagFlag(item, tag)));
}

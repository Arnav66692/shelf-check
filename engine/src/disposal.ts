import { spanOf, termRegExp } from "./text.ts";
import type { CabinetItem, OfficialStatement } from "./types.ts";

export const FDA_FLUSH_LIST_URL =
  "https://www.fda.gov/drugs/disposal-unused-medicines-what-you-should-know/drug-disposal-fdas-flush-list-certain-medicines";
export const FDA_FLUSH_LIST_PAGE_DATE = "10/31/2024";

export interface FlushListEntry {
  readonly id: string;
  readonly listedAs: string;
  readonly words: readonly string[];
  readonly formWords?: readonly string[];
}

// The FDA lists diazepam and methylphenidate in one dosage form each, so the ingredient alone does not put a product on the list.
export const FLUSH_LIST: readonly FlushListEntry[] = [
  { id: "buprenorphine", listedAs: "Any drug that contains the word “buprenorphine”", words: ["buprenorphine"] },
  { id: "fentanyl", listedAs: "Any drug that contains the word “fentanyl”", words: ["fentanyl"] },
  {
    id: "hydrocodone",
    listedAs: "Any drug that contains the word “hydrocodone” or “benzhydrocodone”",
    words: ["hydrocodone", "benzhydrocodone"],
  },
  { id: "hydromorphone", listedAs: "Any drug that contains the word “hydromorphone”", words: ["hydromorphone"] },
  { id: "meperidine", listedAs: "Any drug that contains the word “meperidine”", words: ["meperidine"] },
  { id: "methadone", listedAs: "Any drug that contains the word “methadone”", words: ["methadone"] },
  { id: "morphine", listedAs: "Any drug that contains the word “morphine”", words: ["morphine"] },
  { id: "oxycodone", listedAs: "Any drug that contains the word “oxycodone”", words: ["oxycodone"] },
  { id: "oxymorphone", listedAs: "Any drug that contains the word “oxymorphone”", words: ["oxymorphone"] },
  { id: "tapentadol", listedAs: "Any drug that contains the word “tapentadol”", words: ["tapentadol"] },
  {
    id: "sodium_oxybate",
    listedAs: "Any drug that contains the term “sodium oxybate” or “sodium oxybates”",
    words: ["sodium oxybate"],
  },
  { id: "diazepam_rectal_gel", listedAs: "Diazepam rectal gel", words: ["diazepam"], formWords: ["rectal"] },
  {
    id: "methylphenidate_transdermal_system",
    listedAs: "Methylphenidate transdermal system",
    words: ["methylphenidate"],
    formWords: ["transdermal", "patch"],
  },
];

function flushListStatement(text: string): OfficialStatement {
  return { text, sourceUrl: FDA_FLUSH_LIST_URL, pageDate: FDA_FLUSH_LIST_PAGE_DATE };
}

export const PROVIDER_INSTRUCTIONS_STATEMENT: OfficialStatement = flushListStatement(
  "If you received specific disposal instructions from your healthcare provider (e.g., doctor, pharmacist) for your unused or expired medicine, you should follow those instructions to dispose of your medicine.",
);
export const TAKE_BACK_FIRST_STATEMENT: OfficialStatement = flushListStatement(
  "The best way to dispose of most types* of unused or expired medicines (both prescription and over-the-counter) is to immediately use a take-back option.",
);
export const CHECK_FLUSH_LIST_STATEMENT: OfficialStatement = flushListStatement(
  "If you don’t have a drug take-back location near you or if drug mail-back envelopes are not available to you, check the FDA’s Flush List to see if your medicine is on the list.",
);
export const FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT: OfficialStatement = flushListStatement(
  "Remember only flush medicines on the flush list if a take-back option is not readily available.",
);
export const DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT: OfficialStatement = flushListStatement(
  "Remember, don’t flush your medicine unless it is on the flush list.",
);
export const WHY_FLUSH_LIST_STATEMENT: OfficialStatement = flushListStatement(
  "Medicines on the flush list are those (1) sought-after for their misuse and/or abuse potential and (2) that can result in death from one dose if inappropriately taken.",
);

export type FlushListStatus = "on_flush_list" | "listed_in_one_form_only" | "not_on_flush_list";

export interface FlushListMatch {
  readonly entry: FlushListEntry;
  readonly matchedText: string;
  readonly formConfirmed: boolean;
}

export interface DisposalAdvice {
  readonly itemId: string;
  readonly status: FlushListStatus;
  readonly matches: readonly FlushListMatch[];
  readonly summary: string;
  readonly statements: readonly OfficialStatement[];
}

function firstMatch(words: readonly string[], texts: readonly string[]): string | undefined {
  for (const word of words) {
    const pattern = termRegExp(word);
    for (const text of texts) {
      const span = spanOf(pattern, text);
      if (span !== undefined) return text.slice(span.start, span.end);
    }
  }
  return undefined;
}

function matchEntry(entry: FlushListEntry, item: CabinetItem): readonly FlushListMatch[] {
  const names = item.ingredients.flatMap((ingredient) => [ingredient.name, ...(ingredient.commonNames ?? [])]);
  const matchedText = firstMatch(entry.words, [...names, item.displayName]);
  if (matchedText === undefined) return [];
  const formConfirmed = entry.formWords === undefined || firstMatch(entry.formWords, [item.displayName]) !== undefined;
  return [{ entry, matchedText, formConfirmed }];
}

function statusOf(matches: readonly FlushListMatch[]): FlushListStatus {
  if (matches.some((match) => match.formConfirmed)) return "on_flush_list";
  return matches.length > 0 ? "listed_in_one_form_only" : "not_on_flush_list";
}

function describeMatches(matches: readonly FlushListMatch[]): string {
  return matches.map((match) => `${match.matchedText} (listed as: ${match.entry.listedAs})`).join(", ");
}

const SUMMARY_BY_STATUS: Readonly<Record<FlushListStatus, (item: CabinetItem, matches: readonly FlushListMatch[]) => string>> = {
  on_flush_list: (item, matches) =>
    `${item.displayName} matches the FDA flush list: ${describeMatches(matches.filter((match) => match.formConfirmed))}. The FDA puts a take-back option first. Flushing is for when no take-back option is readily available.`,
  listed_in_one_form_only: (item, matches) =>
    `The FDA flush list names one form only: ${describeMatches(matches)}. ${item.displayName} has that ingredient, but this app cannot tell if it is that form. Check the label or ask a pharmacist.`,
  not_on_flush_list: (item) =>
    `No ingredient of ${item.displayName} matches the FDA flush list. The FDA puts a take-back option first and says not to flush a medicine that is not on the list.`,
};

const STATEMENTS_BY_STATUS: Readonly<Record<FlushListStatus, readonly OfficialStatement[]>> = {
  on_flush_list: [
    PROVIDER_INSTRUCTIONS_STATEMENT,
    TAKE_BACK_FIRST_STATEMENT,
    FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT,
    WHY_FLUSH_LIST_STATEMENT,
  ],
  listed_in_one_form_only: [
    PROVIDER_INSTRUCTIONS_STATEMENT,
    TAKE_BACK_FIRST_STATEMENT,
    CHECK_FLUSH_LIST_STATEMENT,
    DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT,
  ],
  not_on_flush_list: [PROVIDER_INSTRUCTIONS_STATEMENT, TAKE_BACK_FIRST_STATEMENT, DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT],
};

export function disposalAdvice(item: CabinetItem): DisposalAdvice {
  const matches = FLUSH_LIST.flatMap((entry) => matchEntry(entry, item));
  const status = statusOf(matches);
  return {
    itemId: item.id,
    status,
    matches,
    summary: SUMMARY_BY_STATUS[status](item, matches),
    statements: STATEMENTS_BY_STATUS[status],
  };
}

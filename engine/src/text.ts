const SENTENCE_BOUNDARY = /(?<=[.!?][)\]"'”’]?)\s+(?=[A-Z0-9(\["“])|\s*[•■▪●◦♦]\s*/g;
// Recognizable transitions between flattened Drug Facts bullets. A bare "if"
// often qualifies the preceding instruction and is not, by itself, a boundary.
const DRUG_FACTS_BULLET = /(?<=\b(?:in |for )?children under \d+ years?(?: of age)?)\s+(?=if you (?:are (?:now )?taking|have ever had)\b|with any other\b)|(?<=\bto make a child sleepy)\s+(?=with any other\b)|(?<=\beven one used on (?:the )?skin)\s+(?=(?:in|for) children under\b)|(?<=\bpain reliever\/fever reducer)\s+(?=right before or after heart surgery\b)/gi;
const ABBREVIATION_BEFORE_BOUNDARY = /(?:^|[\s("“'‘])(?:St|Dr|Mr|Mrs|Ms|vs|No|Fig|Alt|approx|etc|e\.g|i\.e|U\.S)\.[)\]]?$/;
const WORD_CHARACTER = "A-Za-z0-9";

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRealBoundary(text: string, boundaryStart: number): boolean {
  return !ABBREVIATION_BEFORE_BOUNDARY.test(text.slice(Math.max(0, boundaryStart - 12), boundaryStart));
}

export function splitSentences(text: string, drugFacts = false): readonly string[] {
  const boundaries = [...text.matchAll(SENTENCE_BOUNDARY)]
    .map((match) => ({ start: match.index, end: match.index + match[0].length }))
    .filter((boundary) => isRealBoundary(text, boundary.start));
  const starts = [0, ...boundaries.map((boundary) => boundary.end)];
  const ends = [...boundaries.map((boundary) => boundary.start), text.length];
  const sentences = starts.map((start, index) => text.slice(start, ends[index]).trim()).filter((sentence) => sentence !== "");
  return drugFacts || /^\s*Do not (?:use|take)\b/i.test(text) ? sentences.flatMap((sentence) => sentence.split(DRUG_FACTS_BULLET)) : sentences;
}

// Labels print the apostrophe in "St. John's wort" either straight or curly.
function escapeWord(word: string): string {
  return escapeRegExp(word).replace(/['’]/g, "['’]");
}

function pluralTolerant(word: string): string {
  const stem = /[^s]s$/i.test(word) ? word.slice(0, -1) : word;
  return `${escapeWord(stem)}s?`;
}

// Labels write the same term as "non-steroidal", "nonsteroidal" or "non steroidal", singular or plural.
export function termRegExp(term: string): RegExp {
  const words = term.trim().split(/\s+/);
  const body = words
    .map((word, index) => {
      const parts = word.split("-").filter((part) => part !== "");
      const lastPart = parts.at(-1) ?? "";
      const leading = parts.slice(0, -1).map(escapeWord);
      const isLastWord = index === words.length - 1;
      return [...leading, isLastWord ? pluralTolerant(lastPart) : escapeWord(lastPart)].join("[\\s-]?");
    })
    .join("[\\s-]+");
  return new RegExp(`(?<![${WORD_CHARACTER}])${body}(?![${WORD_CHARACTER}])`, "i");
}

export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}

export function formatNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

export const MAX_EXCERPT_LENGTH = 240;
const ELLIPSIS = "…";
const WHITESPACE = /\s/;

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

function isMidWord(text: string, index: number): boolean {
  return index > 0 && index < text.length && !WHITESPACE.test(text.charAt(index - 1)) && !WHITESPACE.test(text.charAt(index));
}

function nextWordStart(text: string, from: number, limit: number): number {
  if (!isMidWord(text, from)) return from;
  const gap = text.slice(from, limit).search(WHITESPACE);
  return gap === -1 ? limit : from + gap + 1;
}

function previousWordEnd(text: string, from: number, limit: number): number {
  if (!isMidWord(text, from)) return from;
  const gap = text.slice(limit, from).search(/\s\S*$/);
  return gap === -1 ? limit : limit + gap;
}

export function excerptAround(text: string, focus: TextSpan, maxLength: number = MAX_EXCERPT_LENGTH): string {
  if (text.length <= maxLength) return text;
  const focusStart = Math.max(0, Math.min(focus.start, text.length));
  const focusEnd = Math.max(focusStart, Math.min(focus.end, text.length));
  const budget = Math.max(maxLength - 2 * ELLIPSIS.length, focusEnd - focusStart);
  const spare = budget - (focusEnd - focusStart);
  const roughStart = Math.max(0, Math.min(focusStart - Math.floor(spare / 2), text.length - budget));
  const roughEnd = Math.min(text.length, roughStart + budget);
  const start = nextWordStart(text, roughStart, focusStart);
  const end = previousWordEnd(text, roughEnd, focusEnd);
  const body = text.slice(start, end).trim();
  return `${start > 0 ? ELLIPSIS : ""}${body}${end < text.length ? ELLIPSIS : ""}`;
}

export function spanOf(pattern: RegExp, text: string): TextSpan | undefined {
  const found = new RegExp(pattern.source, pattern.flags.replace("g", "")).exec(text);
  return found === null ? undefined : { start: found.index, end: found.index + found[0].length };
}

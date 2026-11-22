export const MAX_QUOTE_LENGTH = 420;
const WINDOW_WORDS_BEFORE = 25;
const WINDOW_CHARS_AFTER = 80;
const MIN_WORDS = 2;
const TABLE_NUMBER_SHARE = 0.35;
const TABLE_MIN_TOKENS = 6;
const ELLIPSIS = "…";

const HEADINGS = [
  "patient counseling information",
  "instructions for patients",
  "information for patients",
  "indications and usage",
  "dosage and administration",
  "dosage forms and strengths",
  "warnings and precautions",
  "adverse reactions",
  "drug interactions",
  "use in specific populations",
  "clinical pharmacology",
  "mechanism of action",
  "pharmacodynamics",
  "pharmacokinetics and metabolism",
  "pharmacokinetics",
  "clinical trials experience",
  "postmarketing experience",
  "recommended dosage",
  "risk summary",
  "contraindications",
  "precautions",
  "absorption",
  "distribution",
  "metabolism",
  "elimination",
  "excretion",
  "food effect",
  "effect of food",
  "general",
  "drug facts",
];

const OTC_HEADINGS = ["other information", "directions", "warnings", "purpose", "uses"];

const HEADING_BEFORE_CAPITAL = new RegExp(`^(?:${HEADINGS.join("|")})\\s+(?=["“(]?[A-Z])`, "i");
const OTC_HEADING = new RegExp(`^(?:${OTC_HEADINGS.join("|")})\\s+(?=\\S)`, "i");
const CAPS_RUN = /^((?:[A-Z][A-Z&/,:-]*\s+){1,6})(?=["“(]?[A-Z]?[a-z])/;
const ABBREVIATIONS = new Set(["st", "dr", "mr", "mrs", "ms", "no", "vs", "approx", "e.g", "i.e", "fig", "u.s", "inc", "ltd", "co"]);
const NOISE = /1-8\d\d-|www\.|https?:\/\/|report suspected|inactive ingredients?\s*:/i;
const DRUG_FACTS_HEADS =
  /\s+(?=(?:Liver warning|Allergy [Aa]lert|Stomach bleeding warning|Heart attack and stroke warning|Sore throat warning|Overdose warning|Do not use|Ask a doctor|When using this product|Stop use and ask a doctor|If pregnant or breast-feeding|Keep out of reach)\b)/;

export function cleanLabelText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\s*see [^\]]*\]/gi, " ")
    .replace(/\(\s*[Ss]ee\s+[A-Z][A-Z ,&/-]*\.?\s*\)\.?/g, " ")
    .replace(/\(\s*\d+(?:\.\d+)*(?:\s*,\s*\d+(?:\.\d+)*)*\s*\)/g, " ")
    .replace(/\b\d{1,2}\.\d{1,2}(?=\s+[A-Z][a-zA-Z])/g, " ")
    .replace(/(^|[.:\]]\s+)\d{1,2}(?=\s+[A-Z][A-Za-z])/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:)])/g, "$1")
    .replace(/\(\s+/g, "(")
    .trim();
}

function stripHeading(sentence: string): string {
  let text = sentence.trim();
  for (let round = 0; round < 3; round += 1) {
    const before = text;
    const caps = CAPS_RUN.exec(text);
    if (caps) {
      const words = caps[1].trim().split(/\s+/);
      if (words.length >= 2 || words[0].replace(/[^A-Z]/g, "").length >= 8) text = text.slice(caps[1].length);
    }
    text = text.replace(HEADING_BEFORE_CAPITAL, "").replace(OTC_HEADING, "").trim();
    if (text === before) break;
  }
  return text;
}

function endsWithAbbreviation(chunk: string): boolean {
  const lastWord = chunk.trim().split(/\s+/).pop() ?? "";
  return ABBREVIATIONS.has(lastWord.replace(/\.$/, "").toLowerCase());
}

function splitOnPeriods(text: string): string[] {
  const pieces = text.split(/(?<=[.!?])\s+(?=["“(]?[A-Z0-9])/);
  const joined: string[] = [];
  for (const piece of pieces) {
    const previous = joined.at(-1);
    if (previous !== undefined && endsWithAbbreviation(previous)) {
      joined[joined.length - 1] = `${previous} ${piece}`;
    } else {
      joined.push(piece);
    }
  }
  return joined;
}

function looksLikeTable(sentence: string): boolean {
  const tokens = sentence.split(/\s+/);
  if (tokens.length < TABLE_MIN_TOKENS) return false;
  const numeric = tokens.filter((token) => /^[\d.,%()<>=±-]+$/.test(token)).length;
  return numeric / tokens.length > TABLE_NUMBER_SHARE;
}

export function splitSentences(cleaned: string): string[] {
  return cleaned
    .split(/\s*[•●▪]\s*/)
    .flatMap((part) => part.split(DRUG_FACTS_HEADS))
    .flatMap(splitOnPeriods)
    .map(stripHeading)
    .filter((sentence) => sentence.split(/\s+/).length >= MIN_WORDS)
    .filter((sentence) => !looksLikeTable(sentence) && !NOISE.test(sentence));
}

function windowStart(words: readonly string[], matchWord: number): number {
  const earliest = Math.max(0, matchWord - WINDOW_WORDS_BEFORE);
  for (let index = matchWord; index > earliest; index -= 1) {
    if (/^[A-Z][a-z]/.test(words[index])) return index;
  }
  return earliest;
}

export function fitQuote(sentence: string, matchAt = 0): string {
  if (sentence.length <= MAX_QUOTE_LENGTH) return sentence;
  const words = sentence.split(" ");
  let charCount = 0;
  let matchWord = 0;
  for (let index = 0; index < words.length; index += 1) {
    if (charCount >= matchAt) {
      matchWord = index;
      break;
    }
    charCount += words[index].length + 1;
  }
  const start = matchAt + WINDOW_CHARS_AFTER < MAX_QUOTE_LENGTH ? 0 : windowStart(words, matchWord);
  const kept: string[] = [];
  let length = 0;
  for (let index = start; index < words.length && length + words[index].length < MAX_QUOTE_LENGTH; index += 1) {
    kept.push(words[index]);
    length += words[index].length + 1;
  }
  const end = start + kept.length;
  return `${start > 0 ? `${ELLIPSIS} ` : ""}${kept.join(" ")}${end < words.length ? ` ${ELLIPSIS}` : ""}`;
}

export function sameText(a: string, b: string): boolean {
  const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const left = squash(a);
  const right = squash(b);
  return left.includes(right) || right.includes(left);
}

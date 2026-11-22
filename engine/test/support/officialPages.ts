import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { OfficialStatement } from "../../src/types.ts";
import { FIXTURE_DIR } from "./fixtures.ts";

const OFFICIAL_DIR = `${FIXTURE_DIR}official/`;

export const OFFICIAL_PAGE_FILES: Readonly<Record<string, string>> = {
  "https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks":
    "fda-bulk-substances-safety-risks.html",
  "https://www.fda.gov/drugs/drug-alerts-and-statements/fdas-concerns-unapproved-glp-1-drugs-used-weight-loss":
    "fda-unapproved-glp1.html",
  "https://www.fda.gov/drugs/human-drug-compounding/fda-alerts-health-care-providers-compounders-and-patients-dosing-errors-associated-compounded":
    "fda-semaglutide-dosing-errors.html",
  "https://www.fda.gov/drugs/disposal-unused-medicines-what-you-should-know/drug-disposal-fdas-flush-list-certain-medicines":
    "fda-flush-list.html",
  "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/summit-research-peptides-695607-12102024":
    "fda-warning-letter-summit-research-peptides.html",
  "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/peak-performance-peptides-735127-08242026":
    "fda-warning-letter-peak-performance-peptides.html",
  "https://www.wada-ama.org/sites/default/files/2025-09/2026list_en_final_clean_september_2025.pdf":
    "wada-prohibited-list-2026.txt",
};

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&nbsp;": " ", "&quot;": '"' };
const INLINE_TAG = /<\/?(?:a|em|strong|b|i|u|sup|sub|span|abbr)(?:\s[^>]*)?>/gi;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function htmlToText(html: string): string {
  const visible = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(INLINE_TAG, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:amp|nbsp|quot);/g, (entity) => ENTITIES[entity] ?? entity);
  return collapseWhitespace(visible);
}

export function readOfficialFile(fileName: string): string {
  return readFileSync(`${OFFICIAL_DIR}${fileName}`, "utf8");
}

export function officialPageText(sourceUrl: string): string {
  const fileName = OFFICIAL_PAGE_FILES[sourceUrl];
  if (fileName === undefined) throw new Error(`No saved copy of ${sourceUrl} in fixtures/official.`);
  const raw = readOfficialFile(fileName);
  return fileName.endsWith(".html") ? htmlToText(raw) : collapseWhitespace(raw);
}

export function expectCopiedFromSource(statement: OfficialStatement): void {
  const page = officialPageText(statement.sourceUrl);
  expect(statement.text).toBe(collapseWhitespace(statement.text));
  expect(page.includes(statement.text), `"${statement.text}" is not in the saved copy of ${statement.sourceUrl}`).toBe(true);
  expect(page.includes(statement.pageDate), `"${statement.pageDate}" is not in the saved copy of ${statement.sourceUrl}`).toBe(true);
}

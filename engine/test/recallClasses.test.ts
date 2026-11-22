import { describe, expect, test } from "vitest";
import {
  DEFINED_RECALL_CLASSES,
  FDA_RECALL_DEFINITIONS_PAGE_DATE,
  FDA_RECALL_DEFINITIONS_URL,
  isDefinedRecallClass,
  RECALL_CLASS_DEFINITIONS,
} from "../src/recallClasses.ts";
import { RECALL_CLASSIFICATIONS } from "../src/recalls.ts";
import { readOfficialFile } from "./support/officialPages.ts";

const SAVED_PAGE = "fda-recalls-background-and-definitions.html";

function savedPageText(): string {
  return readOfficialFile(SAVED_PAGE)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

describe("FDA page of recall background and definitions", () => {
  const page = savedPageText();

  test("the saved file is the page the code links to, with the page date", () => {
    expect(readOfficialFile(SAVED_PAGE)).toContain(`<link rel="canonical" href="${FDA_RECALL_DEFINITIONS_URL}" />`);
    expect(page).toContain(`Content current as of: ${FDA_RECALL_DEFINITIONS_PAGE_DATE}`);
  });

  test.each(DEFINED_RECALL_CLASSES)("the %s definition is copied from the saved page, right after its own label", (recallClass) => {
    const definition = RECALL_CLASS_DEFINITIONS[recallClass];

    expect(definition.text).toBe(definition.text.replace(/\s+/g, " ").trim());
    expect(page).toContain(`${recallClass} recall: ${definition.text}`);
    expect(definition.sourceUrl).toBe(FDA_RECALL_DEFINITIONS_URL);
    expect(definition.pageDate).toBe(FDA_RECALL_DEFINITIONS_PAGE_DATE);
  });

  test("every class a recall record can carry has a definition, except Not Yet Classified", () => {
    const undefinedClasses = RECALL_CLASSIFICATIONS.filter((classification) => !isDefinedRecallClass(classification));

    expect(Object.keys(RECALL_CLASS_DEFINITIONS)).toEqual([...DEFINED_RECALL_CLASSES]);
    expect(undefinedClasses).toEqual(["Not Yet Classified"]);
  });
});

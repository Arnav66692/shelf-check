import { describe, expect, test } from "vitest";
import {
  CHECK_FLUSH_LIST_STATEMENT,
  DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT,
  FDA_FLUSH_LIST_PAGE_DATE,
  FDA_FLUSH_LIST_URL,
  FLUSH_LIST,
  FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT,
  PROVIDER_INSTRUCTIONS_STATEMENT,
  TAKE_BACK_FIRST_STATEMENT,
  WHY_FLUSH_LIST_STATEMENT,
} from "../src/disposal.ts";
import {
  OVERDOSE_SIZE_STATEMENT,
  U100_SYRINGE_STATEMENT,
  UNIT_CONFUSION_STATEMENT,
  VIAL_DISCARD_STATEMENT,
} from "../src/flags/reconstitution.ts";
import {
  APPROVAL_RECORD,
  CATEGORY_2_STATEMENT,
  FDA_BULK_SUBSTANCES_URL,
  PEPTIDE_IDS,
  peptideNames,
  PEPTIDES,
  RESEARCH_USE_ONLY_STATEMENTS,
  WADA_NON_APPROVED_SUBSTANCES_STATEMENT,
  WADA_PROHIBITED_LIST,
  WITHDRAWN_NOMINATION_STATEMENT,
} from "../src/peptides.ts";
import type { Peptide } from "../src/peptides.ts";
import { isRecord, recordArrayField, stringField } from "../src/sources/http.ts";
import { termRegExp } from "../src/text.ts";
import { expectCopiedFromSource, officialPageText, readOfficialFile } from "./support/officialPages.ts";

const ALL_PEPTIDES: readonly Peptide[] = PEPTIDE_IDS.map((id) => PEPTIDES[id]);
const WITHDRAWN_TABLE_START = "Bulk drug substances nominated but withdrawn Bulk drug substance Potential significant safety risks";
const WADA_CLASS_LABEL = /\bS\d(?:\.\d+)*/g;

interface ApprovedRow {
  readonly applicationNumber: string;
  readonly brand: string;
  readonly ingredient: string;
  readonly status: string;
}

function resultsOf(fileName: string): readonly Record<string, unknown>[] {
  const body: unknown = JSON.parse(readOfficialFile(fileName));
  if (!isRecord(body)) throw new Error(`${fileName} is not a JSON object`);
  return recordArrayField(body, "results");
}

function approvedRows(): readonly ApprovedRow[] {
  return resultsOf("openfda-drugsfda-peptides.json").flatMap((application) =>
    recordArrayField(application, "products").flatMap((product) =>
      recordArrayField(product, "active_ingredients").map((ingredient) => ({
        applicationNumber: stringField(application, "application_number") ?? "",
        brand: stringField(product, "brand_name") ?? "",
        ingredient: stringField(ingredient, "name") ?? "",
        status: stringField(product, "marketing_status") ?? "",
      })),
    ),
  );
}

function rowsForBrand(brand: string): readonly ApprovedRow[] {
  const rows = approvedRows();
  const direct = rows.filter((row) => termRegExp(brand).test(row.brand));
  if (direct.length > 0) return direct;
  const listing = resultsOf("openfda-ndc-egrifta.json").find((product) => stringField(product, "brand_name") === brand.toUpperCase());
  const applicationNumber = listing === undefined ? undefined : stringField(listing, "application_number");
  return rows.filter((row) => row.applicationNumber === applicationNumber);
}

describe("FDA page on bulk drug substances that may present significant safety risks", () => {
  const page = officialPageText(FDA_BULK_SUBSTANCES_URL);

  test("the two framing sentences are copied from the saved page", () => {
    expectCopiedFromSource(CATEGORY_2_STATEMENT);
    expectCopiedFromSource(WITHDRAWN_NOMINATION_STATEMENT);
  });

  test.each(ALL_PEPTIDES.filter((peptide) => peptide.fdaStatement !== undefined))(
    "the FDA statement for $id is copied from its saved page, with the page date",
    (peptide) => {
      if (peptide.fdaStatement === undefined) throw new Error("filtered above");

      expectCopiedFromSource(peptide.fdaStatement);
    },
  );

  test.each(ALL_PEPTIDES.filter((peptide) => peptide.fdaStatus === "withdrawn_nomination_risk_text_published"))(
    "$id sits in the withdrawn nominations table, next to its risk text",
    (peptide) => {
      const row = `${peptide.fdaListedAs} ${peptide.fdaStatement?.text}`;

      expect(page.indexOf(WITHDRAWN_TABLE_START)).toBeGreaterThan(0);
      expect(page.indexOf(row)).toBeGreaterThan(page.indexOf(WITHDRAWN_TABLE_START));
    },
  );

  test("ipamorelin sits in the Category 2 table with its list and date, before the withdrawn table", () => {
    const { fdaListedAs, category2, fdaStatement } = PEPTIDES.ipamorelin;
    const row = `${fdaListedAs} ${category2?.policy} ${category2?.dateAdded} ${fdaStatement?.text}`;

    expect(page.indexOf(row)).toBeGreaterThan(0);
    expect(page.indexOf(row)).toBeLessThan(page.indexOf(WITHDRAWN_TABLE_START));
  });
});

describe("FDA approvals in the saved Drugs@FDA result", () => {
  test("the saved result is dated as the code says", () => {
    expect(readOfficialFile("openfda-drugsfda-peptides.json")).toContain(`"last_updated": "${APPROVAL_RECORD.lastUpdated}"`);
  });

  test.each(
    ALL_PEPTIDES.flatMap((peptide) => peptide.approvedProducts.map((product) => ({ id: peptide.id, name: peptide.name, ...product }))),
  )("$brand is an approved $name product with status $status", ({ name, brand, status }) => {
    const rows = rowsForBrand(brand);
    const statuses = rows.map((row) => row.status.toLowerCase());

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => termRegExp(name).test(row.ingredient))).toBe(true);
    expect(status === "discontinued" ? statuses.every((found) => found === "discontinued") : statuses.includes("prescription")).toBe(true);
  });

  test("the saved result holds no approved product for any peptide listed without one", () => {
    const ingredients = approvedRows().map((row) => row.ingredient);

    for (const peptide of ALL_PEPTIDES.filter((candidate) => candidate.approvedProducts.length === 0)) {
      const found = ingredients.filter((ingredient) => peptideNames(peptide).some((name) => termRegExp(name).test(ingredient)));
      expect(found, peptide.id).toEqual([]);
    }
  });
});

describe("WADA 2026 Prohibited List", () => {
  const list = officialPageText(WADA_PROHIBITED_LIST.sourceUrl);

  test("the S0 text and the in-force date are copied from the saved list", () => {
    expectCopiedFromSource(WADA_NON_APPROVED_SUBSTANCES_STATEMENT);
    expect(list).toContain(`This List shall come into effect on ${WADA_PROHIBITED_LIST.inForce}.`);
  });

  test.each(ALL_PEPTIDES.filter((peptide) => peptide.wada.named))("$id is named in the list under the class the code gives", (peptide) => {
    const text = peptide.wada.text ?? "";
    const position = list.indexOf(text);
    const classLabelsBefore = list.slice(0, position).match(WADA_CLASS_LABEL) ?? [];

    expect(text).not.toBe("");
    expect(position).toBeGreaterThan(0);
    expect(termRegExp(peptide.name).test(text) || peptide.aliases.some((alias) => termRegExp(alias).test(text))).toBe(true);
    expect(classLabelsBefore.at(-1)).toBe(peptide.wada.class);
  });

  test.each(ALL_PEPTIDES.filter((peptide) => !peptide.wada.named))("no name of $id appears anywhere in the list text", (peptide) => {
    const found = peptideNames(peptide).filter((name) => termRegExp(name).test(list));

    expect(found).toEqual([]);
  });
});

describe("FDA warning letters, dosing alert, GLP-1 page and flush list", () => {
  test.each(RESEARCH_USE_ONLY_STATEMENTS)("the $firm letter line is copied from the saved letter, with both dates", (statement) => {
    expectCopiedFromSource(statement);
    expect(officialPageText(statement.sourceUrl)).toContain(`${statement.firm} - `);
    expect(officialPageText(statement.sourceUrl)).toContain(statement.letterDate);
  });

  test.each([
    ["U-100 syringe", U100_SYRINGE_STATEMENT],
    ["overdose size", OVERDOSE_SIZE_STATEMENT],
    ["unit confusion", UNIT_CONFUSION_STATEMENT],
    ["vial discard", VIAL_DISCARD_STATEMENT],
    ["provider instructions", PROVIDER_INSTRUCTIONS_STATEMENT],
    ["take-back first", TAKE_BACK_FIRST_STATEMENT],
    ["check the flush list", CHECK_FLUSH_LIST_STATEMENT],
    ["flush only without take-back", FLUSH_ONLY_WITHOUT_TAKE_BACK_STATEMENT],
    ["do not flush unless listed", DO_NOT_FLUSH_UNLESS_LISTED_STATEMENT],
    ["why the flush list exists", WHY_FLUSH_LIST_STATEMENT],
  ])("the %s line is copied from its saved page, with the page date", (_label, statement) => {
    expectCopiedFromSource(statement);
  });

  test("every flush list entry is worded as on the saved page, and no row of the page is left out", () => {
    const page = officialPageText(FDA_FLUSH_LIST_URL);
    const wordRows = page.match(/Any drug that contains the (?:word|term) /g) ?? [];

    expect(page).toContain(`Content current as of: ${FDA_FLUSH_LIST_PAGE_DATE}`);
    for (const entry of FLUSH_LIST) expect(page, entry.id).toContain(entry.listedAs);
    expect(FLUSH_LIST.filter((entry) => entry.listedAs.startsWith("Any drug that contains the"))).toHaveLength(wordRows.length);
    for (const entry of FLUSH_LIST) {
      expect(entry.words.every((word) => termRegExp(word).test(entry.listedAs)), entry.id).toBe(true);
    }
  });
});

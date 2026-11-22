import { describe, expect, test } from "vitest";
import {
  findPeptide,
  findPeptidesInText,
  PEPTIDE_IDS,
  PEPTIDE_STANDING_NOTICE,
  peptideReport,
  PEPTIDES,
} from "../src/peptides.ts";
import type { PeptideId } from "../src/peptides.ts";

const WITHDRAWN_NOMINATIONS: readonly PeptideId[] = [
  "bpc_157",
  "tb_500",
  "cjc_1295",
  "aod_9604",
  "melanotan_ii",
  "ghk_cu",
  "thymosin_alpha_1",
  "mots_c",
  "epitalon",
];
const APPROVED: readonly PeptideId[] = ["semaglutide", "tirzepatide", "tesamorelin", "bremelanotide", "sermorelin"];
const NAMED_BY_WADA: Readonly<Partial<Record<PeptideId, string>>> = {
  bpc_157: "S0",
  tb_500: "S2.3",
  cjc_1295: "S2.2.4",
  ipamorelin: "S2.2.4",
  sermorelin: "S2.2.4",
  tesamorelin: "S2.2.4",
  aod_9604: "S2.2.3",
  mots_c: "S4.4.1",
};
const QUOTED = /"[^"]*"/g;

function ownWords(line: string): string {
  return line.replace(QUOTED, "");
}

describe("findPeptide", () => {
  test.each([
    ["BPC 157", "bpc_157"],
    ["bpc-157", "bpc_157"],
    ["TB500", "tb_500"],
    ["thymosin beta 4", "tb_500"],
    ["PT-141", "bremelanotide"],
    ["bremelanotide", "bremelanotide"],
    ["ozempic", "semaglutide"],
    ["  Mounjaro ", "tirzepatide"],
    ["Egrifta SV", "tesamorelin"],
    ["GHK-Cu", "ghk_cu"],
  ])("%s resolves to %s", (query, id) => {
    expect(findPeptide(query)?.id).toBe(id);
  });

  test("an unknown name and an empty query resolve to nothing", () => {
    expect(findPeptide("vitamin C")).toBeUndefined();
    expect(findPeptide("  ")).toBeUndefined();
  });

  test("every id in the table carries its own id and at least one name", () => {
    for (const id of PEPTIDE_IDS) {
      expect(PEPTIDES[id].id).toBe(id);
      expect(findPeptide(PEPTIDES[id].name)?.id).toBe(id);
    }
  });
});

describe("findPeptidesInText", () => {
  test("a blend label names both of its peptides", () => {
    expect(findPeptidesInText("CJC-1295 / Ipamorelin blend 10mg").map((peptide) => peptide.id)).toEqual(["cjc_1295", "ipamorelin"]);
  });

  test("a name inside a longer word is not a match", () => {
    expect(findPeptidesInText("hexarelin and pralmorelin")).toEqual([]);
  });
});

describe("FDA status", () => {
  test("only ipamorelin is in Category 2, with the list and the date it was added", () => {
    const inCategory2 = PEPTIDE_IDS.filter((id) => PEPTIDES[id].fdaStatus === "category_2");

    expect(inCategory2).toEqual(["ipamorelin"]);
    expect(PEPTIDES.ipamorelin.category2).toEqual({ policy: "503B", dateAdded: "September 29, 2023" });
  });

  test("the nine withdrawn nominations have their own status and still carry the FDA risk text", () => {
    const withdrawn = PEPTIDE_IDS.filter((id) => PEPTIDES[id].fdaStatus === "withdrawn_nomination_risk_text_published");

    expect([...withdrawn].sort()).toEqual([...WITHDRAWN_NOMINATIONS].sort());
    for (const id of WITHDRAWN_NOMINATIONS) {
      expect(PEPTIDES[id].fdaStatement?.text).toContain("may pose");
      expect(PEPTIDES[id].category2).toBeUndefined();
    }
  });

  test("retatrutide carries the FDA line that it cannot be used in compounding", () => {
    expect(PEPTIDES.retatrutide.fdaStatus).toBe("not_compoundable_statement");
    expect(PEPTIDES.retatrutide.fdaStatement?.text).toContain("cannot be used in compounding under federal law");
  });

  test("approved products exist only for the five approved ingredients, and Geref is discontinued", () => {
    const withProducts = PEPTIDE_IDS.filter((id) => PEPTIDES[id].approvedProducts.length > 0);

    expect([...withProducts].sort()).toEqual([...APPROVED].sort());
    expect(PEPTIDES.sermorelin.approvedProducts).toEqual([{ brand: "Geref", status: "discontinued" }]);
    expect(PEPTIDES.semaglutide.approvedProducts.map((product) => product.brand)).toEqual(["Ozempic", "Wegovy", "Rybelsus"]);
  });
});

describe("WADA listing", () => {
  test("eight peptides are named with their class, and the other eight are marked not named", () => {
    for (const id of PEPTIDE_IDS) {
      const expectedClass = NAMED_BY_WADA[id];
      expect(PEPTIDES[id].wada.named).toBe(expectedClass !== undefined);
      expect(PEPTIDES[id].wada.class).toBe(expectedClass);
    }
  });
});

describe("peptideReport", () => {
  test.each([...PEPTIDE_IDS, "not a peptide"])("the report for %s ends with the standing notice", (query) => {
    expect(peptideReport(query).lines.at(-1)).toBe(PEPTIDE_STANDING_NOTICE);
  });

  test("the standing notice is the agreed text, word for word", () => {
    expect(PEPTIDE_STANDING_NOTICE).toBe(
      "This screen cannot tell you whether a peptide is safe for your body. No list can. It shows only what the FDA has approved, what the FDA has published about this ingredient, and the arithmetic for your vial and syringe. Products sold for research use only are not FDA-approved, and the FDA has not reviewed their quality. No flag here means no official statement was found. It does not mean safe. Talk to a licensed prescriber or pharmacist before injecting.",
    );
  });

  test.each(WITHDRAWN_NOMINATIONS)("%s is reported as previously in Category 2, never as on the list", (id) => {
    const body = peptideReport(id).lines.slice(0, -1).map(ownWords).join(" ");

    expect(body).toContain("was previously in Category 2");
    expect(body).toContain("The nomination was withdrawn");
    expect(body).not.toMatch(/\b(?:is|are|remains?|still|lists?|listed)\b[^.]*\bCategory 2\b/i);
  });

  test("ipamorelin is reported as listed in Category 2 with the FDA risk text quoted", () => {
    const report = peptideReport("Ipamorelin Acetate");

    expect(report.peptide?.id).toBe("ipamorelin");
    expect(report.lines.join(" ")).toContain("The FDA lists Ipamorelin acetate in Category 2");
    expect(report.lines.join(" ")).toContain("serious adverse events including death when ipamorelin was administered intravenously");
  });

  test("an approved ingredient lists its brands and says the approval does not cover other vials", () => {
    const lines = peptideReport("wegovy").lines;

    expect(lines[0]).toContain("Ozempic (prescription), Wegovy (prescription), Rybelsus (prescription)");
    expect(lines[1]).toBe("An FDA approval covers that named product only. It does not cover a compounded vial or a vial sold for research use.");
  });

  test("a peptide that WADA does not name is reported as not named, with the S0 text, never as allowed", () => {
    const wadaLine = peptideReport("retatrutide").lines.find((line) => line.startsWith("WADA"));

    expect(wadaLine).toContain("is not named in the list text. Not named does not mean allowed.");
    expect(wadaLine).toContain("with no current approval by any governmental regulatory health authority");
  });

  test("a named peptide is reported with its class and the list wording", () => {
    const wadaLine = peptideReport("TB-500").lines.find((line) => line.startsWith("WADA"));

    expect(wadaLine).toContain("is named under S2.3");
    expect(wadaLine).toContain("its derivatives e.g. TB-500");
  });

  test("an unknown name gets no record and no reassurance", () => {
    const report = peptideReport("mystery peptide");

    expect(report.peptide).toBeUndefined();
    expect(report.lines).toHaveLength(2);
    expect(report.lines[0]).toContain("is not in this app's peptide table");
  });

  test.each([...PEPTIDE_IDS, "not a peptide"])("the report for %s never says in its own words that anything is safe", (query) => {
    const body = peptideReport(query).lines.slice(0, -1).map(ownWords).join(" ");

    expect(body.replace(/does not mean it is safe/g, "")).not.toMatch(/\bsafe\b/i);
  });
});

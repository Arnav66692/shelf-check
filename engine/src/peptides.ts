import { termRegExp } from "./text.ts";
import type { OfficialStatement } from "./types.ts";

export const PEPTIDE_IDS = [
  "semaglutide",
  "tirzepatide",
  "tesamorelin",
  "bremelanotide",
  "sermorelin",
  "bpc_157",
  "tb_500",
  "cjc_1295",
  "ipamorelin",
  "retatrutide",
  "aod_9604",
  "melanotan_ii",
  "ghk_cu",
  "thymosin_alpha_1",
  "mots_c",
  "epitalon",
] as const;

export type PeptideId = (typeof PEPTIDE_IDS)[number];

export type FdaStatus =
  | "approved_product"
  | "category_2"
  | "withdrawn_nomination_risk_text_published"
  | "not_compoundable_statement"
  | "no_statement_found";

export type ApprovalStatus = "prescription" | "discontinued";

export interface ApprovedProduct {
  readonly brand: string;
  readonly status: ApprovalStatus;
}

export interface Category2Listing {
  readonly policy: string;
  readonly dateAdded: string;
}

export interface WadaListing {
  readonly named: boolean;
  readonly class?: string;
  readonly text?: string;
}

export interface Peptide {
  readonly id: PeptideId;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly approvedProducts: readonly ApprovedProduct[];
  readonly fdaStatus: FdaStatus;
  readonly fdaListedAs?: string;
  readonly category2?: Category2Listing;
  readonly fdaStatement?: OfficialStatement;
  readonly wada: WadaListing;
}

export interface WarningLetterStatement extends OfficialStatement {
  readonly firm: string;
  readonly letterDate: string;
}

export const FDA_BULK_SUBSTANCES_URL =
  "https://www.fda.gov/drugs/human-drug-compounding/certain-bulk-drug-substances-use-compounding-may-present-significant-safety-risks";
export const FDA_BULK_SUBSTANCES_PAGE_DATE = "04/22/2026";
export const FDA_UNAPPROVED_GLP1_URL =
  "https://www.fda.gov/drugs/drug-alerts-and-statements/fdas-concerns-unapproved-glp-1-drugs-used-weight-loss";
export const FDA_UNAPPROVED_GLP1_PAGE_DATE = "10/01/2026";

export const APPROVAL_RECORD = {
  name: "Drugs@FDA",
  sourceUrl: "https://api.fda.gov/drug/drugsfda.json",
  lastUpdated: "2026-11-20",
} as const;

export const WADA_PROHIBITED_LIST = {
  name: "WADA 2026 Prohibited List",
  sourceUrl: "https://www.wada-ama.org/sites/default/files/2025-09/2026list_en_final_clean_september_2025.pdf",
  inForce: "1 January 2026",
} as const;

function bulkSubstancesStatement(text: string): OfficialStatement {
  return { text, sourceUrl: FDA_BULK_SUBSTANCES_URL, pageDate: FDA_BULK_SUBSTANCES_PAGE_DATE };
}

function glp1Statement(text: string): OfficialStatement {
  return { text, sourceUrl: FDA_UNAPPROVED_GLP1_URL, pageDate: FDA_UNAPPROVED_GLP1_PAGE_DATE };
}

export const CATEGORY_2_STATEMENT: OfficialStatement = bulkSubstancesStatement(
  "Bulk drug substances that may present significant safety risks have been placed in category 2 under the interim policies.",
);

export const WITHDRAWN_NOMINATION_STATEMENT: OfficialStatement = bulkSubstancesStatement(
  "This list of bulk drug substances previously in category 2 of the interim policies were withdrawn by the nominators.",
);

export const WADA_NON_APPROVED_SUBSTANCES_STATEMENT: OfficialStatement = {
  text: "Any pharmacological substance which is not addressed by any of the subsequent sections of the List and with no current approval by any governmental regulatory health authority for human therapeutic use (e.g. drugs under pre-clinical or clinical development or discontinued, designer drugs, substances approved only for veterinary use) is prohibited at all times.",
  sourceUrl: WADA_PROHIBITED_LIST.sourceUrl,
  pageDate: WADA_PROHIBITED_LIST.inForce,
};

export const RESEARCH_USE_ONLY_STATEMENTS: readonly WarningLetterStatement[] = [
  {
    firm: "Summit Research Peptides",
    letterDate: "12/10/2024",
    text: "Despite statements on your product labeling marketing your products as “RESEARCH USE ONLY” and “INTENDED AS A RESEARCH CHEMICAL ONLY,” evidence obtained from your websites establish that your products are intended to be drugs for human use.",
    sourceUrl:
      "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/summit-research-peptides-695607-12102024",
    pageDate: "12/17/2024",
  },
  {
    firm: "Peak Performance Peptides",
    letterDate: "08/24/2026",
    text: "Despite statements on your product labeling marketing your products for “research use only” and “not for human consumption,” evidence obtained from your website establishes that your products are intended to be drugs for human use.",
    sourceUrl:
      "https://www.fda.gov/inspections-compliance-enforcement-and-criminal-investigations/warning-letters/peak-performance-peptides-735127-08242026",
    pageDate: "09/01/2026",
  },
];

export const PEPTIDE_STANDING_NOTICE =
  "This screen cannot tell you whether a peptide is safe for your body. No list can. It shows only what the FDA has approved, what the FDA has published about this ingredient, and the arithmetic for your vial and syringe. Products sold for research use only are not FDA-approved, and the FDA has not reviewed their quality. No flag here means no official statement was found. It does not mean safe. Talk to a licensed prescriber or pharmacist before injecting.";

const UNAPPROVED_GLP1_STATEMENT: OfficialStatement = glp1Statement(
  "FDA is aware that some patients and health care professionals may look to unapproved versions of GLP-1 (glucagon-like peptide-1 (GLP-1) receptor agonists) drugs, including semaglutide and tirzepatide, as an option for weight loss. This can be risky for patients, as unapproved versions do not undergo FDA’s review for safety, effectiveness and quality before they are marketed.",
);

const NOT_NAMED_BY_WADA: WadaListing = { named: false };
const WADA_GHRH_ANALOGUES: WadaListing = {
  named: true,
  class: "S2.2.4",
  text: "growth hormone-releasing hormone (GHRH) and its analogues (e.g. CJC-1293, CJC-1295, sermorelin and tesamorelin)",
};

export const PEPTIDES: Readonly<Record<PeptideId, Peptide>> = {
  semaglutide: {
    id: "semaglutide",
    name: "semaglutide",
    aliases: [],
    approvedProducts: [
      { brand: "Ozempic", status: "prescription" },
      { brand: "Wegovy", status: "prescription" },
      { brand: "Rybelsus", status: "prescription" },
    ],
    fdaStatus: "approved_product",
    fdaStatement: UNAPPROVED_GLP1_STATEMENT,
    wada: NOT_NAMED_BY_WADA,
  },
  tirzepatide: {
    id: "tirzepatide",
    name: "tirzepatide",
    aliases: [],
    approvedProducts: [
      { brand: "Mounjaro", status: "prescription" },
      { brand: "Zepbound", status: "prescription" },
    ],
    fdaStatus: "approved_product",
    fdaStatement: UNAPPROVED_GLP1_STATEMENT,
    wada: NOT_NAMED_BY_WADA,
  },
  tesamorelin: {
    id: "tesamorelin",
    name: "tesamorelin",
    aliases: ["Egrifta"],
    approvedProducts: [
      { brand: "Egrifta SV", status: "prescription" },
      { brand: "Egrifta WR", status: "prescription" },
    ],
    fdaStatus: "approved_product",
    wada: WADA_GHRH_ANALOGUES,
  },
  bremelanotide: {
    id: "bremelanotide",
    name: "bremelanotide",
    aliases: ["PT-141"],
    approvedProducts: [{ brand: "Vyleesi", status: "prescription" }],
    fdaStatus: "approved_product",
    wada: NOT_NAMED_BY_WADA,
  },
  sermorelin: {
    id: "sermorelin",
    name: "sermorelin",
    aliases: ["sermorelin acetate"],
    approvedProducts: [{ brand: "Geref", status: "discontinued" }],
    fdaStatus: "approved_product",
    wada: WADA_GHRH_ANALOGUES,
  },
  bpc_157: {
    id: "bpc_157",
    name: "BPC-157",
    aliases: [],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "BPC-157",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing BPC-157 may pose risk for immunogenicity for certain routes of administration and may have complexities with regard to peptide-related impurities and active pharmaceutical ingredient (API) characterization. FDA has identified no, or only limited, safety-related information for the proposed routes of administration. Therefore, the agency lacks sufficient information to know whether the drug would cause harm when administered to humans.",
    ),
    wada: {
      named: true,
      class: "S0",
      text: "This class covers many different substances including but not limited to BPC-157",
    },
  },
  tb_500: {
    id: "tb_500",
    name: "TB-500",
    aliases: ["thymosin beta-4", "thymosin beta-4 fragment", "TB4"],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "Thymosin beta-4, fragment (LKKTETQ), also known as TB-500",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing thymosin Beta-4, Fragment (LKKTETQ) may pose risk for immunogenicity for certain routes of administration due to the potential for aggregation as well as peptide-related impurities. FDA has not identified any human exposure data drug products containing Thymosin Beta-4, Fragment. FDA lacks important information regarding any safety issues raised by this drug, including whether it would cause harm if administered to humans.",
    ),
    wada: { named: true, class: "S2.3", text: "Thymosin-ß4 and its derivatives e.g. TB-500" },
  },
  cjc_1295: {
    id: "cjc_1295",
    name: "CJC-1295",
    aliases: ["CJC-1295 DAC", "CJC-1295 with DAC"],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "CJC-1295",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing CJC-1295 may pose risk for immunogenicity for certain routes of administration and may have complexities with regard to for peptide-related impurities and API characterization. FDA has identified serious adverse events associated with CJC-1295 including increased heart rate and systemic vasodilatory reaction. Available clinical data are limited.",
    ),
    wada: WADA_GHRH_ANALOGUES,
  },
  ipamorelin: {
    id: "ipamorelin",
    name: "ipamorelin",
    aliases: ["ipamorelin acetate"],
    approvedProducts: [],
    fdaStatus: "category_2",
    fdaListedAs: "Ipamorelin acetate",
    category2: { policy: "503B", dateAdded: "September 29, 2023" },
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing Ipamorelin acetate may pose risk for immunogenicity for certain routes of administration due to the potential for aggregation or peptide-related impurities. Ipamorelin acetate also contains unnatural amino acids, which add to the complexity of peptide characterization. A study published in literature identified serious adverse events including death when ipamorelin was administered intravenously for improving gastric motility. FDA has not identified safety-related information regarding ipamorelin acetate via certain other injectable routes of administration. Therefore, the agency lacks sufficient information to know whether the drug would cause harm if administered to humans via those routes.",
    ),
    wada: {
      named: true,
      class: "S2.2.4",
      text: "growth hormone secretagogues (GHS) and their mimetics [e.g. anamorelin, capromorelin, ibutamoren (MK-677), ipamorelin, lenomorelin (ghrelin), macimorelin and tabimorelin]",
    },
  },
  retatrutide: {
    id: "retatrutide",
    name: "retatrutide",
    aliases: ["GLP-3R"],
    approvedProducts: [],
    fdaStatus: "not_compoundable_statement",
    fdaStatement: glp1Statement(
      "Retatrutide and cagrilintide cannot be used in compounding under federal law. Additionally, these are not components of FDA-approved drugs and have not been found safe and effective for any condition.",
    ),
    wada: NOT_NAMED_BY_WADA,
  },
  aod_9604: {
    id: "aod_9604",
    name: "AOD-9604",
    aliases: [],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "AOD-9604",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing AOD-9604 may pose significant risk for immunogenicity for certain routes of administration and may have complexities with regard to peptide-related impurities and API characterization. FDA has identified no, or only limited, safety-related information. Therefore, the agency lacks sufficient information to know whether the drug would cause harm when administered to humans. FDA has also identified serious adverse events that may be associated with AOD-9604, though causality is not clear.",
    ),
    wada: { named: true, class: "S2.2.3", text: "growth hormone fragments, e.g. AOD-9604 and hGH 176-191" },
  },
  melanotan_ii: {
    id: "melanotan_ii",
    name: "melanotan II",
    aliases: ["melanotan 2", "MT-II", "MT-2"],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "Melanotan II",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing Melanotan II may pose risk for immunogenicity for certain routes of administration due to the potential for aggregation or peptide-related impurities. Published case reports discuss serious adverse events including melanoma, posterior reversible encephalopathy syndrome, sympathomimetic toxidrome and priapism.",
    ),
    wada: NOT_NAMED_BY_WADA,
  },
  ghk_cu: {
    id: "ghk_cu",
    name: "GHK-Cu",
    aliases: ["GHK copper", "copper peptide GHK", "prezatide copper"],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "GHK-Cu (for injectable routes of administration)",
    fdaStatement: bulkSubstancesStatement(
      "Compounded injectable drugs containing GHK-Cu may pose risk for immunogenicity due to the potential for aggregation and peptide-related impurities. There are limited data in humans to inform safety-related considerations.",
    ),
    wada: NOT_NAMED_BY_WADA,
  },
  thymosin_alpha_1: {
    id: "thymosin_alpha_1",
    name: "thymosin alpha-1",
    aliases: ["Ta1", "thymalfasin"],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "Thymosin-alpha 1 (Ta1)",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing thymosin-alpha-1 (Ta1) may pose significant risk for immunogenicity for certain routes of administration and may have complexities with regard to peptide-related impurities and API characterization. The safety-related information is inadequate for the agency to sufficiently understand the extent of any safety issues raised by the proposed compounded drug.",
    ),
    wada: NOT_NAMED_BY_WADA,
  },
  mots_c: {
    id: "mots_c",
    name: "MOTS-c",
    aliases: [],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "MOTs-C",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing MOTs-C may pose significant risk for immunogenicity for certain routes of administration and may have complexities with regard to peptide-related impurities and API characterization. FDA has not identified any human exposure data on drug products containing MOTs-C administered via any route of administration. FDA lacks important information regarding any safety issues raised by MOTs-C, including whether it would cause harm if administered to humans.",
    ),
    wada: {
      named: true,
      class: "S4.4.1",
      text: "mitochondrial open reading frame of the 12S rRNA-c (MOTS-c)",
    },
  },
  epitalon: {
    id: "epitalon",
    name: "epitalon",
    aliases: ["epithalon", "epithalone"],
    approvedProducts: [],
    fdaStatus: "withdrawn_nomination_risk_text_published",
    fdaListedAs: "Epitalon",
    fdaStatement: bulkSubstancesStatement(
      "Compounded drugs containing epitalon may pose risk for immunogenicity for certain routes of administration due to the potential for aggregation and peptide-related impurities. FDA has not identified safety-related information regarding epitalon for the proposed route of administration. Therefore, the agency lacks sufficient information to know whether the drug would cause harm if administered to humans.",
    ),
    wada: NOT_NAMED_BY_WADA,
  },
};

export interface PeptideReport {
  readonly query: string;
  readonly peptide?: Peptide;
  readonly lines: readonly string[];
}

export function peptideNames(peptide: Peptide): readonly string[] {
  return [peptide.name, ...peptide.aliases, ...peptide.approvedProducts.map((product) => product.brand)];
}

function nameKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function findPeptide(query: string): Peptide | undefined {
  const key = nameKey(query);
  if (key === "") return undefined;
  return PEPTIDE_IDS.map((id) => PEPTIDES[id]).find((peptide) => peptideNames(peptide).some((name) => nameKey(name) === key));
}

export function findPeptidesInText(text: string): readonly Peptide[] {
  return PEPTIDE_IDS.map((id) => PEPTIDES[id]).filter((peptide) =>
    peptideNames(peptide).some((name) => termRegExp(name).test(text)),
  );
}

function sourced(statement: OfficialStatement): string {
  return `"${statement.text}" Source: ${statement.sourceUrl} (page dated ${statement.pageDate}).`;
}

function approvalLines(peptide: Peptide): readonly string[] {
  const record = `${APPROVAL_RECORD.name} data dated ${APPROVAL_RECORD.lastUpdated}`;
  if (peptide.approvedProducts.length === 0) {
    return [`No FDA-approved product with ${peptide.name} was found in ${record}.`];
  }
  const products = peptide.approvedProducts.map((product) => `${product.brand} (${product.status})`).join(", ");
  const everyOneDiscontinued = peptide.approvedProducts.every((product) => product.status === "discontinued");
  return [
    `FDA-approved products with ${peptide.name}, from ${record}: ${products}.`,
    ...(everyOneDiscontinued ? [`${APPROVAL_RECORD.name} lists every one of them as discontinued.`] : []),
    "An FDA approval covers that named product only. It does not cover a compounded vial or a vial sold for research use.",
  ];
}

function statementLines(peptide: Peptide, lead: string): readonly string[] {
  return peptide.fdaStatement === undefined ? [] : [`${lead} ${sourced(peptide.fdaStatement)}`];
}

function fdaLines(peptide: Peptide): readonly string[] {
  const listedAs = peptide.fdaListedAs ?? peptide.name;
  switch (peptide.fdaStatus) {
    case "approved_product":
      return statementLines(peptide, "The FDA has published this:");
    case "category_2": {
      const listing = peptide.category2 === undefined ? "" : ` (${peptide.category2.policy}, added ${peptide.category2.dateAdded})`;
      return [
        `The FDA lists ${listedAs} in Category 2 of its interim policy on bulk drug substances used in compounding${listing}. The FDA page says: ${sourced(CATEGORY_2_STATEMENT)}`,
        ...statementLines(peptide, "The FDA's risk text for this substance:"),
      ];
    }
    case "withdrawn_nomination_risk_text_published":
      return [
        `${listedAs} was previously in Category 2 of the FDA's interim policy on bulk drug substances used in compounding. The nomination was withdrawn. The FDA page says: ${sourced(WITHDRAWN_NOMINATION_STATEMENT)}`,
        ...statementLines(peptide, "The FDA still publishes its risk text for this substance:"),
      ];
    case "not_compoundable_statement":
      return statementLines(peptide, "The FDA has published this:");
    case "no_statement_found":
      return [`No FDA statement about ${peptide.name} was found in the pages this app checked. That does not mean it is safe.`];
  }
}

function wadaLines(peptide: Peptide): readonly string[] {
  const list = `${WADA_PROHIBITED_LIST.name} (in force ${WADA_PROHIBITED_LIST.inForce})`;
  if (!peptide.wada.named) {
    return [
      `${list}: ${peptide.name} is not named in the list text. Not named does not mean allowed. Section S0 of the list says: "${WADA_NON_APPROVED_SUBSTANCES_STATEMENT.text}" Source: ${WADA_PROHIBITED_LIST.sourceUrl}.`,
    ];
  }
  const where = peptide.wada.class === undefined ? "" : ` under ${peptide.wada.class}`;
  const text = peptide.wada.text === undefined ? "" : ` The list text reads: "${peptide.wada.text}" Source: ${WADA_PROHIBITED_LIST.sourceUrl}.`;
  return [`${list}: ${peptide.name} is named${where}.${text}`];
}

export function peptideReport(query: string): PeptideReport {
  const peptide = findPeptide(query);
  if (peptide === undefined) {
    return {
      query,
      lines: [
        `"${query.trim()}" is not in this app's peptide table, so no FDA or WADA record is shown for it. That does not mean it is safe.`,
        PEPTIDE_STANDING_NOTICE,
      ],
    };
  }
  return {
    query,
    peptide,
    lines: [...approvalLines(peptide), ...fdaLines(peptide), ...wadaLines(peptide), PEPTIDE_STANDING_NOTICE],
  };
}

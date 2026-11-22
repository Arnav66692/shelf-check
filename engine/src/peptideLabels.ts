import { PEPTIDES } from "./peptides.ts";
import type { PeptideId } from "./peptides.ts";
import type { OfficialStatement } from "./types.ts";

export const DAILYMED_LABEL_URL = "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=";

export const DAILYMED_RECORD = {
  name: "DailyMed",
  searchUrl: "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json",
  fetched: "2026-11-21",
} as const;

export const NO_APPROVED_USE_NOTICE =
  "No approved use. No approved dose. Claims you see online have not been reviewed by the FDA.";

export const PRESCRIBER_NOTICE =
  "Only a prescriber can decide your dose. This screen quotes labels and does not tell you what to take.";

export const SERMORELIN_NOTICE =
  "Geref, the FDA-approved sermorelin product, is discontinued. DailyMed has no label for Geref or sermorelin, so this app has no label to quote for its use or its dose.";

export interface ProductLabel {
  readonly brand: string;
  readonly title: string;
  readonly setId: string;
  readonly version: number;
  readonly labelDate: string;
  readonly url: string;
  readonly indications: readonly string[];
  readonly dosing: readonly string[];
  readonly boxedWarning?: readonly string[];
  readonly contraindications?: readonly string[];
}

export type PeptideLabelEntry =
  | { readonly approved: true; readonly products: readonly ProductLabel[]; readonly notice?: string }
  | { readonly approved: false; readonly proposedUse?: OfficialStatement; readonly notice: string };

function dailyMedLabel(fields: Omit<ProductLabel, "url">): ProductLabel {
  return { ...fields, url: `${DAILYMED_LABEL_URL}${fields.setId}` };
}

const OZEMPIC_LABEL: ProductLabel = dailyMedLabel({
  brand: "Ozempic",
  title: "OZEMPIC (SEMAGLUTIDE) INJECTION, SOLUTION [NOVO NORDISK PHARMACEUTICAL INDUSTRIES, LP]",
  setId: "adec4fd2-6858-4c99-91d4-531f5f2a2d79",
  version: 20,
  labelDate: "2026-06-01",
  indications: [
    "OZEMPIC is indicated:",
    "as an adjunct to diet and exercise to improve glycemic control in adults with type 2 diabetes mellitus.",
    "to reduce the risk of major adverse cardiovascular events (cardiovascular death, non-fatal myocardial infarction or non-fatal stroke) in adults with type 2 diabetes mellitus and established cardiovascular disease.",
    "to reduce the risk of sustained eGFR decline, end-stage kidney disease, and cardiovascular death in adults with type 2 diabetes mellitus and chronic kidney disease.",
  ],
  dosing: [
    "Start at 0.25 mg once weekly. After 4 weeks, increase the dosage to 0.5 mg once weekly. (2.2)",
  ],
  boxedWarning: [
    "WARNING: RISK OF THYROID C-CELL TUMORS",
    "In rodents, semaglutide causes dose-dependent and treatment-duration-dependent thyroid C-cell tumors at clinically relevant exposures. It is unknown whether OZEMPIC causes thyroid C-cell tumors, including medullary thyroid carcinoma (MTC), in humans as human relevance of semaglutide-induced rodent thyroid C-cell tumors has not been determined [see Warnings and Precautions (5.1), Nonclinical Toxicology (13.1)].",
    "OZEMPIC is contraindicated in patients with a personal or family history of MTC or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Contraindications (4)]. Counsel patients regarding the potential risk for MTC with the use of OZEMPIC and inform them of symptoms of thyroid tumors (e.g., a mass in the neck, dysphagia, dyspnea, persistent hoarseness). Routine monitoring of serum calcitonin or using thyroid ultrasound is of uncertain value for early detection of MTC in patients treated with OZEMPIC [see Contraindications (4), Warnings and Precautions (5.1)].",
  ],
  contraindications: [
    "OZEMPIC is contraindicated in patients with:",
    "A personal or family history of MTC or in patients with MEN 2 [see Warnings and Precautions (5.1)].",
    "A serious hypersensitivity reaction to semaglutide or to any of the excipients in OZEMPIC. Serious hypersensitivity reactions including anaphylaxis and angioedema have been reported with OZEMPIC [see Warnings and Precautions ( 5.8 )].",
  ],
});

const WEGOVY_LABEL: ProductLabel = dailyMedLabel({
  brand: "Wegovy",
  title: "WEGOVY (SEMAGLUTIDE) INJECTION, SOLUTION WEGOVY (SEMAGLUTIDE) TABLET [NOVO NORDISK PHARMACEUTICAL INDUSTRIES, LP]",
  setId: "ee06186f-2aa3-4990-a760-757579d8f77b",
  version: 19,
  labelDate: "2026-06-18",
  indications: [
    "WEGOVY injection is indicated in combination with a reduced calorie diet and increased physical activity:",
    "to reduce the risk of major adverse cardiovascular (CV) events (CV death, non-fatal myocardial infarction, or non-fatal stroke) in adults with established CV disease and either obesity or overweight.",
    "to reduce excess body weight and maintain weight reduction long term in:",
    "adults and pediatric patients aged 12 years and older with obesity.",
    "adults with overweight in the presence of at least one weight-related comorbid condition.",
    "for the treatment of noncirrhotic metabolic dysfunction-associated steatohepatitis (MASH), formerly known as nonalcoholic steatohepatitis (NASH), with moderate to advanced liver fibrosis (consistent with stages F2 to F3 fibrosis) in adults. This indication is approved under accelerated approval based on improvement of MASH and fibrosis [see Clinical Studies (14.4)]. Continued approval for this indication may be contingent upon the verification and description of clinical benefit in a confirmatory trial.",
    "WEGOVY tablets are indicated in combination with a reduced calorie diet and increased physical activity:",
    "to reduce the risk of major adverse CV events (CV death, non-fatal myocardial infarction, or non-fatal stroke) in adults with established CV disease and either obesity or overweight.",
    "to reduce excess body weight and maintain weight reduction long term in adults with obesity, or in adults with overweight in the presence of at least one weight-related comorbid condition.",
    "Limitations of Use",
    "Concomitant use of WEGOVY (semaglutide) tablets or WEGOVY (semaglutide) injection with other semaglutide-containing products or with any other GLP-1 receptor agonist is not recommended.",
  ],
  dosing: [
    "Initiate at 0.25 mg once weekly for 4 weeks. Then follow the dosage escalation schedule in Table 1, titrating every 4 weeks to achieve the maintenance dosage. (2.2)",
    "Initiate WEGOVY tablet with a dosage of 1.5 mg once daily for 30 days. Then follow the dosage escalation schedule, titrating every 30 days to achieve the maintenance dosage. (2.2)",
  ],
  boxedWarning: [
    "WARNING: RISK OF THYROID C-CELL TUMORS",
    "In rodents, semaglutide causes dose-dependent and treatment-duration-dependent thyroid C-cell tumors at clinically relevant exposures. It is unknown whether WEGOVY causes thyroid C-cell tumors, including medullary thyroid carcinoma (MTC), in humans as human relevance of semaglutide-induced rodent thyroid C-cell tumors has not been determined [see Warnings and Precautions ( 5.1 ), Nonclinical Toxicology ( 13.1 )].",
    "WEGOVY is contraindicated in patients with a personal or family history of MTC or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Contraindications ( 4 )]. Counsel patients regarding the potential risk for MTC with the use of WEGOVY and inform them of symptoms of thyroid tumors (e.g., a mass in the neck, dysphagia, dyspnea, persistent hoarseness). Routine monitoring of serum calcitonin or using thyroid ultrasound is of uncertain value for early detection of MTC in patients treated with WEGOVY [see Contraindications ( 4 ), Warnings and Precautions ( 5.1 )].",
  ],
  contraindications: [
    "WEGOVY is contraindicated in the following conditions:",
    "a personal or family history of MTC or in patients with MEN 2 [see Warnings and Precautions ( 5.1 )].",
    "a prior serious hypersensitivity reaction to semaglutide or to any of the excipients in WEGOVY injection or WEGOVY tablet. Serious hypersensitivity reactions, including anaphylaxis and angioedema, have been reported with WEGOVY [see Warnings and Precautions (5.7)].",
  ],
});

const RYBELSUS_LABEL: ProductLabel = dailyMedLabel({
  brand: "Rybelsus",
  title: "OZEMPIC (ORAL SEMAGLUTIDE) TABLET RYBELSUS (ORAL SEMAGLUTIDE) TABLET [NOVO NORDISK PHARMACEUTICAL INDUSTRIES, LP]",
  setId: "27f15fac-7d98-4114-a2ec-92494a91da98",
  version: 14,
  labelDate: "2026-01-30",
  indications: [
    "RYBELSUS and OZEMPIC tablets are indicated:",
    "as an adjunct to diet and exercise to improve glycemic control in adults with type 2 diabetes mellitus.",
    "to reduce the risk of major adverse cardiovascular (CV) events (CV death, non-fatal myocardial infarction or non-fatal stroke) in adults with type 2 diabetes mellitus who are at high risk for these events.",
  ],
  dosing: [
    "Day 1 to 30: Recommended starting dosage is 3 mg orally once daily for 30 days (this dosage is not effective for glycemic control)",
    "Days 31 to 60: Increase the dosage to 7 mg orally once daily.",
  ],
  boxedWarning: [
    "WARNING: RISK OF THYROID C-CELL TUMORS",
    "In rodents, semaglutide causes dose-dependent and treatment-duration-dependent thyroid C-cell tumors at clinically relevant exposures. It is unknown whether RYBELSUS and OZEMPIC tablets cause thyroid C-cell tumors, including medullary thyroid carcinoma (MTC), in humans as human relevance of semaglutide-induced rodent thyroid C-cell tumors has not been determined [see Warnings and Precautions (5.1), Nonclinical Toxicology (13.1)].",
    "RYBELSUS and OZEMPIC tablets are contraindicated in patients with a personal or family history of MTC or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Contraindications (4)]. Counsel patients regarding the potential risk for MTC with the use of RYBELSUS or OZEMPIC tablets and inform them of symptoms of thyroid tumors (e.g., a mass in the neck, dysphagia, dyspnea, persistent hoarseness). Routine monitoring of serum calcitonin or using thyroid ultrasound is of uncertain value for early detection of MTC in patients treated with RYBELSUS or OZEMPIC tablets [see Contraindications (4), Warnings and Precautions (5.1)].",
  ],
  contraindications: [
    "RYBELSUS and OZEMPIC tablets are contraindicated in patients with:",
    "A personal or family history of medullary thyroid carcinoma (MTC) or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Warnings and Precautions (5.1)].",
    "A prior serious hypersensitivity reaction to semaglutide or to any of the excipients in RYBELSUS or OZEMPIC tablets. Serious hypersensitivity reactions including anaphylaxis and angioedema have been reported with semaglutide tablets [see Warnings and Precautions (5.7)].",
  ],
});

const MOUNJARO_LABEL: ProductLabel = dailyMedLabel({
  brand: "Mounjaro",
  title: "MOUNJARO (TIRZEPATIDE) INJECTION, SOLUTION MOUNJARO KWIKPEN (TIRZEPATIDE) INJECTION, SOLUTION [ELI LILLY AND COMPANY]",
  setId: "d2d7da5d-ad07-4228-955f-cf7e355c8cc0",
  version: 40,
  labelDate: "2026-08-27",
  indications: [
    "MOUNJARO® is indicated:",
    "as an adjunct to diet and exercise to improve glycemic control in adults and pediatric patients 10 years of age and older with type 2 diabetes mellitus.",
    "to reduce the risk of major adverse cardiovascular (CV) events (CV death, non-fatal myocardial infarction (MI), or non-fatal stroke) in adults with type 2 diabetes mellitus who are at high risk for these events.",
  ],
  dosing: [
    "The recommended starting dosage is 2.5 mg injected subcutaneously once weekly. (2.1)",
    "If additional glycemic control is needed, increase the dosage in 2.5 mg increments after at least 4 weeks on the current dose. (2.1)",
  ],
  boxedWarning: [
    "WARNING: RISK OF THYROID C-CELL TUMORS",
    "In both male and female rats, tirzepatide causes dose-dependent and treatment-duration-dependent thyroid C-cell tumors at clinically relevant exposures. It is unknown whether MOUNJARO causes thyroid C-cell tumors, including medullary thyroid carcinoma (MTC), in humans as human relevance of tirzepatide-induced rodent thyroid C-cell tumors has not been determined [see Warnings and Precautions (5.1) and Nonclinical Toxicology (13.1)].",
    "MOUNJARO is contraindicated in patients with a personal or family history of MTC or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Contraindications (4)] . Counsel patients regarding the potential risk for MTC with the use of MOUNJARO and inform them of symptoms of thyroid tumors (e.g., a mass in the neck, dysphagia, dyspnea, persistent hoarseness). Routine monitoring of serum calcitonin or using thyroid ultrasound is of uncertain value for early detection of MTC in patients treated with MOUNJARO [see Contraindications (4) and Warnings and Precautions (5.1)].",
  ],
  contraindications: [
    "MOUNJARO is contraindicated in patients with:",
    "A personal or family history of medullary thyroid carcinoma (MTC) or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Warnings and Precautions (5.1)].",
    "Known serious hypersensitivity to tirzepatide or any of the excipients in MOUNJARO. Serious hypersensitivity reactions, including anaphylaxis and angioedema, have been reported with MOUNJARO [see Warnings and Precautions (5.4)].",
  ],
});

const ZEPBOUND_LABEL: ProductLabel = dailyMedLabel({
  brand: "Zepbound",
  title: "ZEPBOUND (TIRZEPATIDE) INJECTION, SOLUTION ZEPBOUND (TIRZEPATIDE) INJECTION, SOLUTION ZEPBOUND KWIKPEN (TIRZEPATIDE) INJECTION, SOLUTION [ELI LILLY AND COMPANY]",
  setId: "487cd7e7-434c-4925-99fa-aa80b1cc776b",
  version: 40,
  labelDate: "2026-08-28",
  indications: [
    "ZEPBOUND® is indicated in combination with a reduced-calorie diet and increased physical activity:",
    "to reduce excess body weight and maintain weight reduction long term in adults with obesity or adults with overweight in the presence of at least one weight-related comorbid condition.",
    "to treat moderate to severe obstructive sleep apnea (OSA) in adults with obesity.",
    "Limitations of Use",
    "ZEPBOUND contains tirzepatide. Coadministration with other tirzepatide-containing products or with any glucagon-like peptide-1 (GLP-1) receptor agonist is not recommended.",
  ],
  dosing: [
    "The recommended starting dosage is 2.5 mg injected subcutaneously once weekly for 4 weeks. Increase the dosage in 2.5 mg increments after at least 4 weeks until recommended maintenance dosage is achieved. (2.1)",
  ],
  boxedWarning: [
    "WARNING: RISK OF THYROID C-CELL TUMORS",
    "In rats, tirzepatide causes dose-dependent and treatment-duration-dependent thyroid C-cell tumors at clinically relevant exposures. It is unknown whether ZEPBOUND causes thyroid C-cell tumors, including medullary thyroid carcinoma (MTC), in humans as human relevance of tirzepatide-induced rodent thyroid C-cell tumors has not been determined [see Warnings and Precautions (5.1) and Nonclinical Toxicology (13.1)].",
    "ZEPBOUND is contraindicated in patients with a personal or family history of MTC or in patients with Multiple Endocrine Neoplasia syndrome type 2 (MEN 2) [see Contraindications (4)] . Counsel patients regarding the potential risk for MTC with the use of ZEPBOUND and inform them of symptoms of thyroid tumors (e.g., a mass in the neck, dysphagia, dyspnea, persistent hoarseness). Routine monitoring of serum calcitonin or using thyroid ultrasound is of uncertain value for early detection of MTC in patients treated with ZEPBOUND [see Contraindications (4) and Warnings and Precautions (5.1)].",
  ],
  contraindications: [
    "ZEPBOUND is contraindicated in patients with:",
    "A personal or family history of MTC or in patients with MEN 2 [see Warnings and Precautions (5.1)].",
    "Known serious hypersensitivity to tirzepatide or any of the excipients in ZEPBOUND. Serious hypersensitivity reactions, including anaphylaxis and angioedema, have been reported with tirzepatide [see Warnings and Precautions (5.6) and Adverse Reactions (6.2)].",
  ],
});

const EGRIFTA_SV_LABEL: ProductLabel = dailyMedLabel({
  brand: "Egrifta SV",
  title: "EGRIFTA SV (TESAMORELIN) KIT [THERATECHNOLOGIES INC.]",
  setId: "3d783378-b02d-4f19-99dd-0fc91a042224",
  version: 9,
  labelDate: "2026-07-29",
  indications: [
    "EGRIFTA SV is indicated for the reduction of excess abdominal fat in HIV-infected adult patients with lipodystrophy.",
    "Limitations of Use:",
    "Long-term cardiovascular safety of EGRIFTA SV has not been established. Consider risk/benefit of continuation of treatment in patients who have not had a reduction in visceral adipose tissue.",
    "EGRIFTA SV is not indicated for weight loss management as it has a weight neutral effect.",
    "There are no data to support improved compliance with anti-retroviral therapies in HIV-positive patients taking EGRIFTA SV.",
  ],
  dosing: [
    "The dose of EGRIFTA SV is 1.4 mg (0.35 mL of the reconstituted solution) injected subcutaneously once daily. (2.1)",
  ],
  contraindications: [
    "EGRIFTA SV is contraindicated in:",
    "Patients with disruption of the hypothalamic-pituitary axis due to hypophysectomy, hypopituitarism, pituitary tumor/surgery, head irradiation or head trauma.",
    "Patients with active malignancy. Any preexisting malignancy should be inactive and its treatment complete prior to instituting therapy [see Warnings and Precautions (5.1)].",
    "Patients with known hypersensitivity to tesamorelin or the excipients in EGRIFTA SV [see Warnings and Precautions (5.5)].",
    "Pregnant women because modifying visceral adipose tissue offers no benefit in a pregnant woman and could result in fetal harm [see Use in Specific Populations (8.1)].",
  ],
});

const EGRIFTA_WR_LABEL: ProductLabel = dailyMedLabel({
  brand: "Egrifta WR",
  title: "EGRIFTA WR (TESAMORELIN) KIT [THERATECHNOLOGIES INC.]",
  setId: "839334d3-8c1d-4c26-9036-2ab524a6ea75",
  version: 2,
  labelDate: "2026-07-29",
  indications: [
    "EGRIFTA WR is indicated for the reduction of excess abdominal fat in HIV-infected adult patients with lipodystrophy.",
    "Limitations of Use:",
    "Long-term cardiovascular safety of EGRIFTA WR has not been established. Consider risk/benefit of continuation of treatment in patients who have not had a reduction in visceral adipose tissue.",
    "EGRIFTA WR is not indicated for weight loss management as it has a weight neutral effect.",
    "There are no data to support improved compliance with anti-retroviral therapies in HIV-positive patients taking EGRIFTA WR.",
  ],
  dosing: [
    "The dose of EGRIFTA WR is 1.28 mg (0.16 mL of the reconstituted solution) injected subcutaneously once daily. (2.1)",
  ],
  contraindications: [
    "EGRIFTA WR is contraindicated in:",
    "Patients with disruption of the hypothalamic-pituitary axis due to hypophysectomy, hypopituitarism, pituitary tumor/surgery, head irradiation or head trauma.",
    "Patients with active malignancy. Any preexisting malignancy should be inactive and its treatment complete prior to instituting therapy [see Warnings and Precautions (5.1)].",
    "Patients with known hypersensitivity to tesamorelin or the excipients in EGRIFTA WR [see Warnings and Precautions (5.5)].",
    "Pregnant women because modifying visceral adipose tissue offers no benefit in a pregnant woman and could result in fetal harm [see Use in Specific Populations (8.1)].",
  ],
});

const VYLEESI_LABEL: ProductLabel = dailyMedLabel({
  brand: "Vyleesi",
  title: "VYLEESI (BREMELANOTIDE) INJECTION [COSETTE PHARMACEUTICALS, INC.]",
  setId: "f1d0c1b5-2f39-4bad-a6a4-0066e3ad5dcf",
  version: 2,
  labelDate: "2026-11-05",
  indications: [
    "VYLEESI is indicated for the treatment of premenopausal women with acquired, generalized hypoactive sexual desire disorder (HSDD), as characterized by low sexual desire that causes marked distress or interpersonal difficulty and is NOT due to:",
    "A co-existing medical or psychiatric condition,",
    "Problems with the relationship, or",
    "The effects of a medication or drug substance.",
    "Acquired HSDD refers to HSDD that develops in a patient who previously had no problems with sexual desire. Generalized HSDD refers to HSDD that occurs regardless of the type of stimulation, situation or partner.",
    "Limitations of Use",
    "VYLEESI is not indicated for the treatment of HSDD in postmenopausal women or in men.",
    "VYLEESI is not indicated to enhance sexual performance.",
  ],
  dosing: [
    "Inject 1.75 mg subcutaneously via the autoinjector to the abdomen or thigh, as needed, at least 45 minutes before anticipated sexual activity. ( 2.1)",
    "Do not administer more than one dose within 24 hours. ( 2.1)",
    "More than 8 doses per month is not recommended. ( 2.1)",
  ],
  contraindications: [
    "VYLEESI is contraindicated in patients who have uncontrolled hypertension or known cardiovascular disease [see Warnings and Precautions ( 5.1)].",
  ],
});

const NOT_APPROVED: PeptideLabelEntry = { approved: false, notice: NO_APPROVED_USE_NOTICE };

export const PEPTIDE_LABELS: Readonly<Record<PeptideId, PeptideLabelEntry>> = {
  semaglutide: { approved: true, products: [OZEMPIC_LABEL, WEGOVY_LABEL, RYBELSUS_LABEL] },
  tirzepatide: { approved: true, products: [MOUNJARO_LABEL, ZEPBOUND_LABEL] },
  tesamorelin: { approved: true, products: [EGRIFTA_SV_LABEL, EGRIFTA_WR_LABEL] },
  bremelanotide: { approved: true, products: [VYLEESI_LABEL] },
  sermorelin: { approved: true, products: [], notice: SERMORELIN_NOTICE },
  bpc_157: NOT_APPROVED,
  tb_500: NOT_APPROVED,
  cjc_1295: NOT_APPROVED,
  ipamorelin: NOT_APPROVED,
  retatrutide: NOT_APPROVED,
  aod_9604: NOT_APPROVED,
  melanotan_ii: NOT_APPROVED,
  ghk_cu: NOT_APPROVED,
  thymosin_alpha_1: NOT_APPROVED,
  mots_c: NOT_APPROVED,
  epitalon: NOT_APPROVED,
};

export function hasMarketedProduct(id: PeptideId): boolean {
  return PEPTIDES[id].approvedProducts.some((product) => product.status === "prescription");
}

function quoted(lines: readonly string[]): string {
  return lines.map((line) => `"${line}"`).join(" ");
}

function productLines(product: ProductLabel): readonly string[] {
  return [
    `${product.brand}. What the label says it is for: ${quoted(product.indications)}`,
    `How the ${product.brand} label says to start: ${quoted(product.dosing)}`,
    ...(product.boxedWarning === undefined ? [] : [`Boxed warning on the ${product.brand} label: ${quoted(product.boxedWarning)}`]),
    ...(product.contraindications === undefined
      ? []
      : [`Contraindications on the ${product.brand} label: ${quoted(product.contraindications)}`]),
    `Source: ${product.title}, ${DAILYMED_RECORD.name} label version ${product.version}, dated ${product.labelDate}. ${product.url}`,
  ];
}

function proposedLines(statement: OfficialStatement | undefined): readonly string[] {
  return statement === undefined
    ? []
    : [`Proposed in a nomination to the FDA: "${statement.text}" Source: ${statement.sourceUrl} (page dated ${statement.pageDate}).`];
}

export function peptideUses(id: PeptideId): readonly string[] {
  const entry = PEPTIDE_LABELS[id];
  if (!entry.approved) return [entry.notice, ...proposedLines(entry.proposedUse), PRESCRIBER_NOTICE];
  return [
    ...(entry.notice === undefined ? [] : [entry.notice]),
    ...entry.products.flatMap(productLines),
    PRESCRIBER_NOTICE,
  ];
}

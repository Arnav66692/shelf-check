// FDA, Drug Development and Drug Interactions | Table of Substrates, Inhibitors and Inducers:
// https://www.fda.gov/drugs/drug-interactions-labeling/drug-development-and-drug-interactions-table-substrates-inhibitors-and-inducers
// Its "Examples of clinical substrates, inhibitors, and inducers" link leads to Table 1,
// CYP Enzyme- and Transporter System-Based Clinical Substrates, Inhibitors, or Inducers:
// https://www.fda.gov/drugs/drug-interactions-labeling/healthcare-professionals-fdas-examples-drugs-interact-cyp-enzymes-and-transporter-systems
// The ingredient lists below are single-substance clinical rows, read by column and potency.
// A combination row, substrate column or in vitro result does not establish membership here.
import type { DrugClass, Ingredient } from "./types.ts";

const FDA_TABLE = "FDA Table 1 (CYP Enzyme- and Transporter System-Based Clinical Substrates, Inhibitors, or Inducers)";
const CYP3A = "CYP3A(?:4(?:/5)?)?";
const PGP = "P[- ]?(?:gp|glycoprotein)";
const STRONG = "(?:strong|potent)";
const STRENGTH = `(?:${STRONG}(?: (?:or|and) moderate)?|moderate (?:or|and) ${STRONG})`;
const CYP3A_TARGET = `(?:${STRENGTH} )?${CYP3A}`;
const ALTERNATIVE = "(?:or|and/or)";
const inhibitor3A = ["adagrasib", "ceritinib", "clarithromycin", "cobicistat", "idelalisib", "itraconazole",
  "ketoconazole", "nefazodone", "nelfinavir", "posaconazole", "ritonavir", "telithromycin", "tucatinib", "voriconazole"];
const inducer3A = ["apalutamide", "carbamazepine", "enzalutamide", "ivosidenib", "mitotane", "phenytoin", "rifampin"];
const inhibitor2D6 = ["bupropion", "fluoxetine", "paroxetine", "quinidine", "terbinafine"];
const inhibitorPgp = ["amiodarone", "clarithromycin", "cobicistat", "cyclosporine", "dronedarone", "erythromycin",
  "itraconazole", "ketoconazole", "propafenone", "quinidine", "ranolazine", "tucatinib", "verapamil"];

// A shared noun or an explicit "both" requires evidence for every pathway.
// Recognize a broader set of restrictions than we can positively classify.
const PATHWAY = `(?:(?:${STRENGTH}|weak|moderate) )?(?:CYP[0-9][A-Z][0-9]*|${PGP}|OATP[0-9][A-Z][0-9]|BCRP)`;
function jointPhrase(left: string, right: string, action: string): string {
  const prefix = "(?:(?:both|dual|combined) )?";
  return [
    `${prefix}${left} and ${right} ${action}`,
    `${prefix}${action} of (?:both )?${left} and ${right}`,
    `(?:both|dual|combined) (?:an? )?${left} ${action} and (?:an? )?${right} ${action}`,
    `(?:both|dual|combined) ${action} of ${left} and ${action} of ${right}`,
  ].join("|");
}
const JOINT_PATHWAYS = new RegExp(`\\b(?:${jointPhrase(PATHWAY, PATHWAY, "(?:inhibitors?|inducers?)")})\\b`, "gi");
const DUAL_INHIBITOR = new RegExp(`\\b(?:${jointPhrase(PGP, CYP3A_TARGET, "inhibitors?")}|${jointPhrase(CYP3A_TARGET, PGP, "inhibitors?")})\\b`, "i");

export interface MechanismTerm {
  readonly term: string;
  readonly pattern: RegExp;
  readonly source: string;
  readonly dual?: boolean;
}

interface MechanismRule {
  readonly term: string;
  readonly pattern: RegExp;
  readonly members?: readonly string[];
  readonly epcs?: readonly string[];
  readonly dual?: boolean;
}

// An unqualified CYP warning includes strong inhibitors/inducers. If the label specifies
// a weaker potency, the span guard below prevents an unqualified substring from matching.
function cypPhrase(enzyme: string, action: string): RegExp {
  const alternate = action === "inhibitor" ? `(?: ${ALTERNATIVE} ${PGP})?` : "";
  return new RegExp(`\\b(?:${STRENGTH} )?(?:${enzyme}${alternate} ${action}s?|${action}s? of ${enzyme})\\b`, "i");
}

const MECHANISMS: readonly MechanismRule[] = [
  { term: "strong CYP3A4 inhibitor", pattern: cypPhrase(CYP3A, "inhibitor"), members: inhibitor3A },
  { term: "strong CYP3A inducer", pattern: cypPhrase(CYP3A, "inducer"), members: inducer3A },
  { term: "strong CYP2D6 inhibitor", pattern: cypPhrase("CYP2D6", "inhibitor"), members: inhibitor2D6 },
  { term: "P-gp inhibitor", pattern: new RegExp(`\\b(?:${PGP}(?: ${ALTERNATIVE} ${CYP3A_TARGET})? inhibitors?|inhibitors? of ${PGP})\\b`, "i"), members: inhibitorPgp },
  { term: "combined P-gp and strong CYP3A4 inhibitor", pattern: DUAL_INHIBITOR,
    members: inhibitor3A.filter((name) => inhibitorPgp.includes(name)), dual: true },
  { term: "OATP1B1 inhibitor", pattern: /\b(?:OATP1B1 inhibitors?|inhibitors? of OATP1B1)\b/i,
    members: ["clarithromycin", "cyclosporine", "darolutamide", "teriflunomide"] },
  // RxClass FDASPL, class/byRxcui, has_EPC. Test the individual ingredient's actual record.
  // https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxClass.getClassByRxNormDrugId.html
  { term: "MAO inhibitor", pattern: /\b(?:MAOIs?|(?:monoamine oxidase|MAO) inhibitors?)\b/i,
    epcs: ["Monoamine Oxidase Inhibitor", "Monoamine Oxidase Type B Inhibitor"] },
  { term: "serotonergic drug", pattern: /\bserotonergic (?:drugs?|agents?|medic(?:ation|ine)s?|substances?)\b/i,
    epcs: ["Serotonin Reuptake Inhibitor", "Serotonin and Norepinephrine Reuptake Inhibitor",
      "Serotonin-1b and Serotonin-1d Receptor Agonist"] },
  // Labels list these as serotonergic drugs by name, and their EPCs do not say so.
  { term: "serotonergic drug", pattern: /\bserotonergic (?:drugs?|agents?|medic(?:ation|ine)s?|substances?)\b/i,
    members: ["dextromethorphan", "tramadol", "trazodone", "buspirone", "lithium", "fentanyl", "meperidine", "methadone", "tryptophan", "linezolid"] },
  { term: "SNRI", pattern: /\b(?:SNRIs?|serotonin[- ](?:and )?norepinephrine reuptake inhibitors?)\b/i,
    epcs: ["Serotonin and Norepinephrine Reuptake Inhibitor"] },
  { term: "triptan", pattern: /\btriptans?\b/i, epcs: ["Serotonin-1b and Serotonin-1d Receptor Agonist"] },
  { term: "potassium-sparing diuretic", pattern: /\bpotassium[- ](?:sparing|retaining) diuretics?\b/i,
    epcs: ["Potassium-sparing Diuretic"] },
  { term: "potassium-sparing diuretic", pattern: /\bpotassium[- ](?:sparing|retaining) diuretics?\b/i,
    epcs: ["Aldosterone Antagonist"], members: ["spironolactone", "eplerenone"] },
  // Potassium Salt also covers nonsupplements such as potassium fluoride.
  { term: "potassium supplement", pattern: /\b(?:potassium supplements?|supplemental potassium|potassium supplementation)\b/i,
    epcs: ["Potassium Salt"], members: ["potassium chloride", "potassium bicarbonate"] },
];

// Table 1 covers CYPs/transporters, not QT prolongation or serotonin toxicity.
// Do not infer those effects from a broad EPC such as Antiarrhythmic, Opioid
// Agonist or Oxazolidinone Antibacterial, or from a bare CYP substrate entry.
export function mechanismTermsFor(ingredient: Ingredient): readonly MechanismTerm[] {
  const name = ingredient.name.trim().toLowerCase();
  // RxNorm normally resolves the salt to its base. Accept conventional salt
  // suffixes on older records, but never match a substring or a different active ingredient.
  const base = name.replace(/ (?:hydrochloride|hydrobromide|mesylate|sulfate|gluconate|sodium)$/, "");
  return MECHANISMS.flatMap((rule) => {
    if (rule.members && !rule.members.includes(name) && !rule.members.includes(base)) return [];
    const epc = rule.epcs && ingredient.classes?.find((c) => isFdaEpc(c) &&
      rule.epcs?.some((epcName) => epcName.toLowerCase() === c.name.toLowerCase()));
    if (rule.epcs && !epc) return [];
    const source = epc ? `RxClass FDASPL established pharmacologic class “${epc.name}”` : FDA_TABLE;
    return [{ term: rule.term, pattern: rule.pattern, source, ...(rule.dual ? { dual: true } : {}) }];
  });
}

function isFdaEpc(drugClass: DrugClass): boolean {
  return drugClass.type === "EPC" && drugClass.source === "FDASPL";
}

export function mechanismSpanAllowed(text: string, start: number, end: number, mechanism: MechanismTerm): boolean {
  const before = text.slice(0, start);
  if (/\b(?:weak|moderate|strong|potent|selective)(?:ly)?\s+$/i.test(before)) return false;
  if (mechanism.dual) return true;
  return ![...text.matchAll(JOINT_PATHWAYS)].some((joint) =>
    start < joint.index + joint[0].length && end > joint.index);
}

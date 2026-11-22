import { describe, expect, test } from "vitest";
import { CONDITION_IDS, InvalidProfileError, profileFlags } from "../src/flags/profile.ts";
import type { ConditionId, HealthProfile } from "../src/flags/profile.ts";
import { checkCabinet } from "../src/index.ts";
import carbinoxamine from "../fixtures/official/openfda-carbinoxamine-age-sections.json";
import { createOpenFdaClient } from "../src/sources/openfda.ts";
import { supplementItemFromLabel } from "../src/supplement.ts";
import type { CabinetItem, Flag } from "../src/types.ts";
import { expectVerbatim, fixtureSources, loadCabinet, loadMixedCabinet, loadSupplements } from "./support/cabinet.ts";

const NOTHING: HealthProfile = { conditions: [], allergies: [] };

function withConditions(...conditions: readonly ConditionId[]): HealthProfile {
  return { ...NOTHING, conditions };
}

function aboutItem(flags: readonly Flag[], itemId: string): readonly Flag[] {
  return flags.filter((flag) => flag.itemIds[0] === itemId);
}

function ageFlag(items: readonly CabinetItem[], ageYears: number): Flag | undefined {
  return profileFlags(items, { ...NOTHING, ageYears })[0];
}

describe("profile flags: conditions", () => {
  test("an empty profile gives no flags", async () => {
    const items = await loadCabinet("tylenol", "nyquil", "aspirin", "warfarin", "lisinoprilHctz");

    expect(profileFlags(items, NOTHING)).toEqual([]);
  });

  test("liver disease is flagged on Tylenol with the label's own line", async () => {
    const items = await loadCabinet("tylenol");

    const flags = profileFlags(items, withConditions("liver_disease"));

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "profile", severity: "ask", itemIds: ["tylenol"] });
    expect(flags[0]?.match).toEqual({ text: "liver disease", term: "liver_disease", kind: "condition" });
    expect(flags[0]?.quote).toMatchObject({ section: "ask_doctor", text: "Ask a doctor before use if you have liver disease" });
    expectVerbatim(flags[0]?.quote, items);
  });

  test("a label that does not mention the condition gives no flag", async () => {
    const items = await loadCabinet("tylenol", "loratadine");
    const notOnTheseLabels: readonly ConditionId[] = [
      "high_blood_pressure",
      "heart_disease",
      "diabetes",
      "glaucoma",
      "enlarged_prostate",
      "thyroid_disease",
      "breathing_problem",
      "stomach_ulcers_or_bleeding",
    ];

    expect(profileFlags(items, withConditions(...notOnTheseLabels))).toEqual([]);
  });

  test("reads the wordings real labels use", async () => {
    const items = await loadCabinet("loratadine", "nyquil", "benadryl", "aspirin", "ibuprofen");
    const matchedText = (itemId: string, condition: ConditionId): string | undefined =>
      aboutItem(profileFlags(items, withConditions(condition)), itemId)[0]?.match?.text;

    expect(matchedText("loratadine", "liver_disease")).toBe("liver or kidney disease");
    expect(matchedText("loratadine", "kidney_disease")).toBe("kidney disease");
    expect(matchedText("aspirin", "liver_disease")).toBe("liver cirrhosis");
    expect(matchedText("aspirin", "high_blood_pressure")).toBe("high blood pressure");
    expect(matchedText("ibuprofen", "heart_disease")).toBe("heart disease");
    expect(matchedText("nyquil", "glaucoma")).toBe("glaucoma");
    expect(matchedText("nyquil", "enlarged_prostate")).toBe("trouble urinating");
    expect(matchedText("benadryl", "breathing_problem")).toBe("breathing problem");
    expect(matchedText("aspirin", "breathing_problem")).toBe("asthma");
  });

  test("asthma listed as an allergic reaction is not read as a breathing condition", async () => {
    const items = await loadCabinet("aspirin");
    const allergyAlert = (items[0]?.label?.warnings ?? []).join(" ");

    const [flag] = profileFlags(items, withConditions("breathing_problem"));
    const quotes = [flag?.quote, ...(flag?.supportingQuotes ?? [])];

    expect(allergyAlert).toContain("asthma (wheezing)");
    expect(flag?.quote?.section).toBe("ask_doctor");
    expect(quotes.some((quote) => quote?.text.includes("asthma (wheezing)") === true && quote.section === "warnings")).toBe(false);
  });

  test("stomach ulcers on aspirin: the ask-a-doctor line leads and the stomach bleeding warning is attached", async () => {
    const items = await loadCabinet("aspirin");

    const [flag] = profileFlags(items, withConditions("stomach_ulcers_or_bleeding"));

    expect(flag?.quote?.section).toBe("ask_doctor");
    expect(flag?.supportingQuotes?.map((quote) => quote.section)).toEqual(["ask_doctor", "warnings"]);
    expect(flag?.supportingQuotes?.[1]?.excerpt).toContain("have had stomach ulcers or bleeding problems");
    for (const quote of flag?.supportingQuotes ?? []) expectVerbatim(quote, items);
  });

  test("the diabetes contraindication keeps its aliskiren prerequisite", async () => {
    const items = await loadCabinet("lisinoprilHctz", "warfarin");

    const flags = profileFlags(items, withConditions("diabetes", "stomach_ulcers_or_bleeding"));

    const bleeding = flags.find((flag) => flag.itemIds[0] === "warfarin" && flag.match?.term === "stomach_ulcers_or_bleeding");
    expect(bleeding).toMatchObject({ severity: "stop", quote: { section: "contraindications" } });
    const diabetes = flags.find((flag) => flag.itemIds[0] === "lisinoprilHctz" && flag.match?.term === "diabetes");
    expect(diabetes?.severity).toBe("ask");
    expect(diabetes?.explain).toContain("aliskiren");
    expect(diabetes?.detail).not.toContain("Your profile says this applies");
    expect(diabetes?.quote?.text).toBe(
      "Do not coadminister aliskiren with lisinopril and hydrochlorothiazide tablets in patients with diabetes.",
    );
  });

  test("warfarin quotes renal monitoring from warnings and precautions", async () => {
    const items = await loadCabinet("warfarin");
    const [flag] = profileFlags(items, withConditions("kidney_disease"));
    expect(flag).toMatchObject({ severity: "ask", quote: { section: "warnings_and_cautions" } });
    const quotes = [flag?.quote, ...(flag?.supportingQuotes ?? [])];
    expect(quotes.some((quote) => quote?.text.includes("More frequent monitoring"))).toBe(true);
  });

  test("high blood pressure is not flagged on a blood pressure medicine whose warnings never use that phrase", async () => {
    const items = await loadCabinet("lisinoprilHctz");

    expect(profileFlags(items, withConditions("high_blood_pressure"))).toEqual([]);
  });

  test("each condition gives at most one flag per product", async () => {
    const items = await loadCabinet("tylenol", "nyquil", "benadryl", "tylenolPm", "aspirin", "ibuprofen", "loratadine");

    const flags = profileFlags(items, withConditions(...CONDITION_IDS));
    const keys = flags.map((flag) => `${flag.itemIds[0]}:${flag.match?.term}`);

    expect(flags.length).toBeGreaterThan(15);
    expect(new Set(keys).size).toBe(keys.length);
    for (const flag of flags) expectVerbatim(flag.quote, items);
  });
});

describe("profile flags: alcohol, pregnancy and breast-feeding", () => {
  test("the 3 or more alcoholic drinks warning is quoted when the profile says so", async () => {
    const items = await loadCabinet("tylenol", "aspirin", "benadryl", "loratadine");

    const flags = profileFlags(items, { ...NOTHING, drinksThreeOrMoreDaily: true });

    expect(flags.map((flag) => flag.itemIds[0])).toEqual(["tylenol", "aspirin"]);
    expect(flags[0]?.match).toMatchObject({ kind: "alcohol", text: "3 or more alcoholic drinks" });
    expect(flags[0]?.quote?.excerpt).toContain("3 or more alcoholic drinks every day while using this product");
    expect(profileFlags(items, { ...NOTHING, drinksThreeOrMoreDaily: false })).toEqual([]);
  });

  test("pregnancy: the OTC line is an ask, a contraindication or boxed warning is a stop", async () => {
    const items = await loadCabinet("tylenol", "warfarin", "lisinoprilHctz");

    const flags = profileFlags(items, { ...NOTHING, pregnant: true });

    expect(flags.map((flag) => [flag.itemIds[0], flag.severity, flag.quote?.section])).toEqual([
      ["tylenol", "ask", "pregnancy_or_breast_feeding"],
      ["warfarin", "stop", "contraindications"],
      ["lisinoprilHctz", "stop", "boxed_warning"],
    ]);
    expect(flags[0]?.quote?.text).toBe("If pregnant or breast-feeding, ask a health professional before use.");
    expect(flags[2]?.quote?.text).toContain("When pregnancy is detected, discontinue");
  });

  test("pregnancy on aspirin also attaches the last 3 months line", async () => {
    const items = await loadCabinet("aspirin");

    const [flag] = profileFlags(items, { ...NOTHING, pregnant: true });

    expect(flag?.supportingQuotes?.some((quote) => quote.text.includes("last 3 months of pregnancy"))).toBe(true);
  });

  test("breast-feeding: read from OTC labels, prescription nursing text and supplement warnings", async () => {
    const items = await loadMixedCabinet(["tylenol", "lisinoprilHctz"], ["melatonin", "stJohnsWort", "melatonin3mg"]);

    const flags = profileFlags(items, { ...NOTHING, breastfeeding: true });

    expect(flags.map((flag) => [flag.itemIds[0], flag.quote?.section, flag.match?.text])).toEqual([
      ["tylenol", "pregnancy_or_breast_feeding", "breast-feeding"],
      ["lisinoprilHctz", "nursing_mothers", "Nursing"],
      ["melatonin", "warnings", "nursing"],
      ["stJohnsWort", "warnings", "lactation"],
    ]);
  });
});

describe("profile flags: age", () => {
  test("carbinoxamine quotes the pediatric contraindication below the two-year boundary", async () => {
    const source = createOpenFdaClient({ fetch: async () => ({ status: 200, text: async () => JSON.stringify(carbinoxamine) }) });
    const label = await source.getLabel("73684-110");
    const item: CabinetItem = { id: "73684-110", displayName: "Carbinoxamine maleate", kind: "rx", ingredients: [], verified: true };
    for (const section of ["contraindications", "pediatric_use", "dosage_and_administration"] as const) {
      const items = [{ ...item, label: { [section]: label?.[section] ?? [] } }];
      expect(ageFlag(items, 1)).toMatchObject({ severity: "stop", quote: { section }, numbers: { belowYears: 2 } });
      expectVerbatim(ageFlag(items, 1)?.quote, items);
      expect(ageFlag(items, 2)).toBeUndefined();
    }
  });

  test("boxed age restrictions respect the exact month boundary and negation", async () => {
    const [base] = await loadCabinet("benadryl");
    if (!base) throw new Error("missing label");
    for (const text of ["Do not give to infants younger than 6 months of age.", "Infants younger than six months: do not use."]) {
      const items = [{ ...base, label: { boxed_warning: [text] } }];
      expect(ageFlag(items, 5 / 12)).toMatchObject({ severity: "stop", numbers: { belowYears: 0.5 } });
      expect(ageFlag(items, 6 / 12)).toBeUndefined();
    }
    for (const text of [
      "Use is not contraindicated in infants younger than 6 months.",
      "Use is contraindicated in infants younger than 6 months with renal impairment.",
      "For patients receiving sedatives, treatment is contraindicated in children younger than 2 years.",
      "Intravenous use is contraindicated in children younger than 2 years.",
    ]) {
      expect(ageFlag([{ ...base, label: { boxed_warning: [text] } }], 0)).toBeUndefined();
    }
  });

  test("children under 12 years: flagged at 8, nothing at 12 or as an adult", async () => {
    const items = await loadCabinet("tylenol");

    const flag = ageFlag(items, 8);

    expect(flag).toMatchObject({ type: "profile", severity: "ask", numbers: { ageYears: 8, fromYears: 0, belowYears: 12 } });
    expect(flag?.match).toMatchObject({ kind: "age", text: "under 12 years ask a doctor" });
    expect(flag?.quote?.section).toBe("dosage_and_administration");
    expect(ageFlag(items, 12)).toBeUndefined();
    expect(ageFlag(items, 40)).toBeUndefined();
  });

  test("NyQuil: 4 to under 12 is ask a doctor, under 4 is do not use", async () => {
    const items = await loadCabinet("nyquil");

    expect(ageFlag(items, 8)).toMatchObject({ severity: "ask", numbers: { fromYears: 4, belowYears: 12 } });
    expect(ageFlag(items, 3)).toMatchObject({ severity: "stop", numbers: { fromYears: 0, belowYears: 4 } });
    expect(ageFlag(items, 12)).toBeUndefined();
  });

  test("a dosing row for an age band is not a limit: Benadryl at 8 gives nothing, at 4 and at 1 it is a stop", async () => {
    const items = await loadCabinet("benadryl");

    expect(ageFlag(items, 8)).toBeUndefined();
    expect(ageFlag(items, 4)).toMatchObject({ severity: "stop", numbers: { fromYears: 2, belowYears: 6 } });
    expect(ageFlag(items, 1)).toMatchObject({ severity: "stop", numbers: { fromYears: 0, belowYears: 2 } });
  });

  test("an age line inside Do not use is a stop", async () => {
    const items = await loadCabinet("tylenolPm");

    const flag = ageFlag(items, 8);

    expect(flag).toMatchObject({ severity: "stop", numbers: { belowYears: 12 } });
    expect(flag?.quote?.section).toBe("do_not_use");
    expect(flag?.quote?.excerpt).toContain("in children under 12 years of age");
  });

  test("supplements: not intended for persons under the age of 18", async () => {
    const items = await loadSupplements("melatonin");

    expect(ageFlag(items, 16)).toMatchObject({ severity: "ask", numbers: { belowYears: 18 } });
    expect(ageFlag(items, 16)?.quote?.text).toBe("Not intended for use by persons under the age of 18.");
    expect(ageFlag(items, 18)).toBeUndefined();
  });

  test("aspirin: the stomach bleeding warning for age 60 or older applies at 74, not at 40", async () => {
    const items = await loadCabinet("aspirin");

    const flag = ageFlag(items, 74);

    expect(flag).toMatchObject({ severity: "ask", numbers: { ageYears: 74, fromYears: 60 } });
    expect(flag?.quote?.excerpt).toContain("age 60 or older");
    expect(ageFlag(items, 40)).toBeUndefined();
  });

  test("a label with no clear lower age gives nothing for a child", async () => {
    const items = await loadCabinet("warfarin");

    expect(ageFlag(items, 5)).toBeUndefined();
  });
});

describe("profile flags: allergies", () => {
  test("warfarin allergies match the normalized drug and its printed NDC ingredient", async () => {
    const items = await loadCabinet("warfarin");
    for (const allergy of ["warfarin", "Warfarin Sodium"]) {
      const [flag] = profileFlags(items, { ...NOTHING, allergies: [allergy] });
      expect(flag).toMatchObject({ severity: "stop", quote: { text: "WARFARIN SODIUM", section: "ndc_active_ingredient" } });
    }
    expect(profileFlags(items, { ...NOTHING, allergies: ["sodium"] })).toEqual([]);
    const legacy = items.map((item) => ({ ...item, ingredients: item.ingredients.map(({ name, value, unit }) => ({ name, value, unit })) }));
    const [flag] = profileFlags(legacy, { ...NOTHING, allergies: ["warfarin"] });
    expect(flag).toMatchObject({ severity: "stop", quote: { text: "warfarin", section: "normalized_active_ingredient" } });
  });

  test("Bluebonnet's Contains declaration identifies cod and excludes uncertain or negative declarations", async () => {
    const sources = fixtureSources();
    const label = await sources.dsld.getLabel("177772");
    if (!label) throw new Error("missing Bluebonnet fixture");
    const request = { id: "vitaminD3", dsldId: label.id };
    const item = await supplementItemFromLabel(request, label, sources);
    const profile = { ...NOTHING, allergies: ["cod", "soy", "milk"] };
    const flags = profileFlags([item], profile);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ severity: "stop", match: { term: "cod" }, quote: { text: "Contains: Fish (cod)" } });
    expectVerbatim(flags[0]?.quote, [item]);
    for (const notes of ["May contain cod.", "Free of cod.", "Contains no cod.", "Contains: soy. May contain cod."]) {
      const statements = [{ type: "Precautions re: Allergies", notes }];
      const changed = await supplementItemFromLabel(request, { ...label, statements }, sources);
      expect(profileFlags([changed], { ...NOTHING, allergies: ["cod"] })).toEqual([]);
    }
  });

  test("an allergen in the active ingredients is a stop", async () => {
    const items = await loadCabinet("aspirin", "tylenol");

    const flags = profileFlags(items, { ...NOTHING, allergies: ["aspirin"] });

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ severity: "stop", itemIds: ["aspirin"] });
    expect(flags[0]?.match).toEqual({ text: "Aspirin", term: "aspirin", kind: "allergen" });
    expect(flags[0]?.quote?.section).toBe("active_ingredient");
  });

  test("an allergen in the inactive ingredients is found too", async () => {
    const items = await loadCabinet("loratadine", "tylenol");

    const flags = profileFlags(items, { ...NOTHING, allergies: ["Lactose"] });

    expect(flags.map((flag) => [flag.itemIds[0], flag.quote?.section, flag.match?.text])).toEqual([
      ["loratadine", "inactive_ingredient", "lactose"],
    ]);
  });

  test("a label allergy alert that names the allergen is flagged even when it is not an ingredient", async () => {
    const items = await loadCabinet("ibuprofen");

    const [flag] = profileFlags(items, { ...NOTHING, allergies: ["aspirin"] });

    expect(flag).toMatchObject({ severity: "ask", itemIds: ["ibuprofen"] });
    expect(flag?.quote?.text).toContain("especially in people allergic to aspirin");
  });

  test("supplement ingredient text is searched: fish in fish oil and in vitamin D3 from fish liver oil", async () => {
    const items = await loadSupplements("fishOil", "vitaminD3", "melatonin");

    const flags = profileFlags(items, { ...NOTHING, allergies: ["fish"] });

    expect(flags.map((flag) => flag.itemIds[0])).toEqual(["fishOil", "vitaminD3"]);
    expect(flags[1]?.quote?.text).toContain("from Fish Liver Oil");
    for (const flag of flags) expectVerbatim(flag.quote, items);
  });

  test("an allergen no label names gives nothing, and blank entries are ignored", async () => {
    const items = await loadCabinet("tylenol", "aspirin", "ibuprofen");

    expect(profileFlags(items, { ...NOTHING, allergies: ["penicillin", "  "] })).toEqual([]);
  });
});

describe("profile flags: input and wiring", () => {
  test("rejects an impossible age and an unknown condition", async () => {
    const items = await loadCabinet("tylenol");
    const unknown = { ...NOTHING, conditions: ["gout"] } as unknown as HealthProfile;

    expect(() => profileFlags(items, { ...NOTHING, ageYears: -1 })).toThrow(InvalidProfileError);
    expect(() => profileFlags(items, { ...NOTHING, ageYears: Number.NaN })).toThrow(InvalidProfileError);
    expect(() => profileFlags(items, unknown)).toThrow(InvalidProfileError);
  });

  test("checkCabinet adds profile flags only when a profile is given, and keeps stop first", async () => {
    const items = await loadCabinet("tylenol", "warfarin");
    const rank = { stop: 0, ask: 1, info: 2 } as const;

    const withProfile = checkCabinet(items, { ...NOTHING, pregnant: true, conditions: ["liver_disease"] });
    const ranks = withProfile.map((flag) => rank[flag.severity]);

    expect(checkCabinet(items).some((flag) => flag.type === "profile")).toBe(false);
    expect(withProfile.filter((flag) => flag.type === "profile")).toHaveLength(3);
    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
  });

  test("the profile and the cabinet are not changed", async () => {
    const items = await loadCabinet("tylenol", "aspirin");
    const profile: HealthProfile = { ageYears: 8, pregnant: true, conditions: ["liver_disease"], allergies: ["aspirin"] };
    const before = JSON.stringify([items, profile]);

    profileFlags(items, profile);

    expect(JSON.stringify([items, profile])).toBe(before);
  });
});

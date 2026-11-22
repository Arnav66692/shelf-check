export const PRODUCT_NDCS = {
  tylenol: "50580-590",
  nyquil: "84126-342",
  benadryl: "50580-573",
  tylenolPm: "67751-241",
  aspirin: "70264-013",
  warfarin: "0093-1720",
  lisinoprilHctz: "60760-586",
  sertraline: "63187-859",
  ibuprofen: "29485-6552",
  loratadine: "11523-0800",
} as const;

export const MISSING_PRODUCT_NDC = "99999-0000";

export const SUPPLEMENT_DSLD_IDS = {
  melatonin: "13302",
  vitaminD3: "177772",
  stJohnsWort: "10129",
  fishOil: "178317",
  melatonin3mg: "320628",
  ginkgo: "33452",
  vitaminK: "65786",
} as const;

export const MISSING_DSLD_ID = "999999999";

export const DSLD_SEARCHES: readonly (readonly [string, number])[] = [
  ["melatonin", 5],
  ["ginkgo", 5],
  ["vitamin K", 5],
];

export const EXTRA_RXNAV_NAMES: readonly string[] = ["CHOLECALCIFEROL", "Vitamin D3", "MELATONIN"];

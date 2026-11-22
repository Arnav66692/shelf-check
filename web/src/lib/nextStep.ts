import type { Flag } from "./model";

const LABEL_TAG_STEPS: Readonly<Record<string, string>> = {
  Alcohol: "Avoid alcohol while taking these unless a pharmacist says it is fine for you.",
  Grapefruit: "Ask a pharmacist before having grapefruit or grapefruit juice with these.",
  Drowsiness: "Do not drive or use machinery until you know how these affect you.",
  Sun: "Limit time in the sun and ask a pharmacist about sun protection while taking these.",
};

const KEEP_TAKING = "Do not stop or change a prescribed medicine on your own.";
const MAOI = /\bMAOI\b|monoamine oxidase/i;
const SPACE_APART = /\b\d+\s*(?:to\s*\d+\s*)?hours?\s+(?:before|after|apart)\b|\bseparate\b.*\bdoses?\b/i;

function subjectOf(flag: Flag): string {
  return flag.highlight?.[0] ?? "this ingredient";
}

function mentions(flag: Flag, pattern: RegExp): boolean {
  return flag.quotes.some((quote) => pattern.test(quote.excerpt));
}

function interactionStep(flag: Flag): string {
  if (mentions(flag, MAOI)) {
    return "Do not take these within 2 weeks of an MAOI unless the doctor who prescribed it says so. Ask a pharmacist now.";
  }
  if (mentions(flag, SPACE_APART)) {
    return "The label says to space these apart. Ask a pharmacist how many hours apart to take them.";
  }
  if (flag.allPrescribed) {
    return `These may be prescribed together on purpose. Make sure the prescriber and pharmacist know you take both, and ask if anything should change. ${KEEP_TAKING}`;
  }
  if (flag.prescribed) {
    return `Ask a pharmacist before taking the non-prescription product with your prescribed medicine. ${KEEP_TAKING}`;
  }
  return "Ask a pharmacist before taking these on the same day. Show them the quoted line.";
}

function prescribedStep(flag: Flag): string | undefined {
  switch (flag.type) {
    case "duplicate_ingredient":
    case "daily_total":
      return flag.allPrescribed
        ? `Call your pharmacist or prescriber today and ask whether you should be taking both products with ${subjectOf(flag)}. ${KEEP_TAKING}`
        : `Do not add a non-prescription product with ${subjectOf(flag)} to your prescribed one until a pharmacist says it is fine. ${KEEP_TAKING}`;
    case "profile":
      return flag.severity === "stop"
        ? `Call your prescriber today about this warning. ${KEEP_TAKING}`
        : `Tell your prescriber or pharmacist about the health detail it mentions. ${KEEP_TAKING}`;
    case "recall":
      return `Compare the lot number on your bottle with the recall. If it matches, call your pharmacy today for a replacement. ${KEEP_TAKING}`;
    default:
      return undefined;
  }
}

export function nextStep(flag: Flag): string {
  if (flag.type === "interaction") return interactionStep(flag);
  const prescribed = flag.prescribed ? prescribedStep(flag) : undefined;
  if (prescribed) return prescribed;
  switch (flag.type) {
    case "duplicate_ingredient":
      return `Take only one product with ${subjectOf(flag)} at a time, unless a pharmacist tells you otherwise.`;
    case "daily_total":
      return `Use only one ${subjectOf(flag)} product at a time, or ask a pharmacist which one to keep.`;
    case "profile":
      return flag.quotes.some((quote) => quote.section === "fda_statement")
        ? "Talk to a licensed prescriber or pharmacist before using it."
        : "Ask a doctor or pharmacist before using this, and tell them about the health detail it mentions.";
    case "label_tag":
      return LABEL_TAG_STEPS[flag.title] ?? "Read the quoted line before you combine this with what it mentions.";
    case "recall":
      return "Compare the lot number on your bottle with the recall. If it matches, stop using it and call your pharmacy.";
    case "expiry":
      return flag.severity === "stop" ? "Ask a pharmacist about replacing it before the next dose." : "Plan to replace it soon.";
    case "refill":
      return "Order a refill before it runs out.";
    default:
      return "Show this to a pharmacist before you change what you take.";
  }
}

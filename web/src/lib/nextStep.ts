import type { Flag } from "./model";

const LABEL_TAG_STEPS: Readonly<Record<string, string>> = {
  Alcohol: "Avoid alcohol while taking these unless a pharmacist says it is fine for you.",
  Grapefruit: "Ask a pharmacist before having grapefruit or grapefruit juice with these.",
  Drowsiness: "Do not drive or use machinery until you know how these affect you.",
  Sun: "Limit time in the sun and ask a pharmacist about sun protection while taking these.",
};

const KEEP_TAKING = "Do not stop or change a prescribed medicine on your own.";
const MAOI = /\bMAOI\b|monoamine oxidase/i;
const LABEL_SAYS_STOP = /\b(?:contraindicated|do not (?:use|take|start)|should not be (?:used|taken|given|coadministered|co-administered)|avoid (?:co-?administration|concomitant|use|taking)|discontinue|must not)\b/i;
const HOLD_DOSE = "The label says not to use these together, or not to use it with this health detail. Call the prescriber or pharmacist today, before the next dose, and ask what to do. If you have trouble breathing, swelling of the face or throat, or a severe rash, call 911.";
const ALLERGY_STEP = "The label says not to take it if you are allergic to it. Do not take the next dose until you have talked to the prescriber or pharmacist today. If you have trouble breathing, swelling of the face or throat, or a severe rash, call 911.";
const HYPERKALEMIA = /\bhyperkalemia\b/i;
const SEDATION = /\brespiratory depression|profound sedation|\bcoma\b/i;
const SPACE_APART = /\b\d+\s*(?:to\s*\d+\s*)?hours?\s+(?:before|after|apart)\b|\bseparate\b.*\bdoses?\b/i;

function subjectOf(flag: Flag): string {
  return flag.highlight?.[0] ?? "this ingredient";
}

function mentions(flag: Flag, pattern: RegExp): boolean {
  return flag.quotes.some((quote) => pattern.test(quote.excerpt));
}

function labelSaysStop(flag: Flag): boolean {
  return flag.severity === "stop" && mentions(flag, LABEL_SAYS_STOP);
}

function interactionStep(flag: Flag): string {
  if (flag.severity === "stop" && mentions(flag, SEDATION)) {
    return "Call the prescriber or pharmacist today to confirm these are meant to be taken together. Do not drink alcohol with them. If someone is very hard to wake or breathing slowly, give naloxone (Narcan) if you have it and call 911.";
  }
  if (flag.severity === "stop" && mentions(flag, HYPERKALEMIA)) {
    return "Ask your prescriber for a potassium blood test soon. Do not take extra potassium or a salt substitute until then. Call 911 for chest pain, a very slow or uneven heartbeat, or sudden weakness.";
  }
  if (labelSaysStop(flag) && flag.prescribed) return HOLD_DOSE;
  if ((flag.highlight ?? []).some((term) => MAOI.test(term) || /phenelzine|tranylcypromine|isocarboxazid|selegiline|rasagiline|linezolid/i.test(term))) {
    return "Do not take these within 2 weeks of an MAOI unless the doctor who prescribed it says so. Ask a pharmacist now.";
  }
  if (mentions(flag, SPACE_APART)) {
    return "The label says to space these apart. Ask a pharmacist how many hours apart to take them.";
  }
  if (flag.allPrescribed && flag.severity === "stop") {
    return "The label warns of serious harm when these are taken together. Call the prescriber or pharmacist today, before the next dose, to confirm the plan.";
  }
  if (flag.allPrescribed) {
    return `These may be prescribed together on purpose. Make sure the prescriber and pharmacist know you take both, and ask if anything should change. ${KEEP_TAKING}`;
  }
  if (flag.prescribed) {
    return `Ask a pharmacist before taking the non-prescription product with your prescribed medicine. ${KEEP_TAKING}`;
  }
  return "Ask a pharmacist before taking these together. Taking them at different times of day does not make it safe. Show them the quoted line.";
}

function prescribedStep(flag: Flag): string | undefined {
  switch (flag.type) {
    case "duplicate_ingredient":
    case "daily_total":
      return flag.allPrescribed
        ? `Call your pharmacist or prescriber today and ask whether you should be taking both products with ${subjectOf(flag)}. ${KEEP_TAKING}`
        : `Do not add a non-prescription product with ${subjectOf(flag)} to your prescribed one until a pharmacist says it is fine. ${KEEP_TAKING}`;
    case "profile":
      if (/allerg/i.test(flag.title) || (flag.highlight ?? []).some((term) => /allerg/i.test(term))) return ALLERGY_STEP;
      if (labelSaysStop(flag)) return HOLD_DOSE;
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
      if (/allerg/i.test(flag.title)) return "The label says do not use it if you are allergic to it. Do not use it. Ask a pharmacist for something else.";
      if (flag.quotes.some((quote) => quote.section === "do_not_use")) {
        return "The label says do not use this product if this applies to you. Do not use it. Ask a pharmacist for something else.";
      }
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

import type { Flag } from "./model";

const LABEL_TAG_STEPS: Readonly<Record<string, string>> = {
  Alcohol: "Avoid alcohol while taking these unless a pharmacist says it is fine for you.",
  Grapefruit: "Ask a pharmacist before having grapefruit or grapefruit juice with these.",
  Drowsiness: "Do not drive or use machinery until you know how these affect you.",
  Sun: "Limit time in the sun and ask a pharmacist about sun protection while taking these.",
};

const KEEP_TAKING = "Do not stop or change a prescribed medicine on your own.";
const MAOI = /\bMAOI\b|monoamine oxidase/i;
const LABEL_SAYS_STOP = /\b(?:contraindicated|(?:is |are )?not recommended|do not (?:use|take|start|give)|should not be (?:used|taken|given|coadministered|co-administered)|avoid (?:co-?administration|concomitant|use|taking)|discontinue|must not)\b/i;
const HOLD_DOSE = "The label says not to use these together. Call the prescriber or pharmacist today, before the next dose, and ask what to do.";
const HOLD_FOR_HEALTH = "The label says not to use this with the health detail in your profile. Call the prescriber or pharmacist today, before the next dose, and ask what to do.";
const HOLD_FOR_PREGNANCY = "The label says not to use this in pregnancy. Call the prescriber today, before the next dose, and do not wait for your next visit.";
const ALLERGY_STEP = "The label says not to take it if you are allergic to it. Do not take the next dose until you have talked to the prescriber or pharmacist today. If you have trouble breathing, swelling of the face or throat, or a severe rash, call 911.";
const HYPERKALEMIA = /\bhyperkalemia\b/i;
const BLOOD_THINNER_EFFECT = /\bINR\b|\b(?:effects?|response|activity) of (?:warfarin|oral anticoagulants?)|\banticoagulant (?:effects?|response|activity)\b|\bprolong\w* (?:the )?prothrombin time|\bprothrombin time[^.;]{0,30}increas\w*/i;
const DOSE_CHANGE = /\b(?:reduce|decrease|lower|adjust)\w* (?:the )?(?:\w+ )?(?:dose|dosage)|\bdos(?:e|age) (?:reduction|adjustment)s?\b|\bone[- ]third\b|\bdo not exceed \w+ \d/i;
// For a pair, "discontinue" usually means stop one drug if a side effect happens, not do not combine.
const PAIR_SAYS_STOP = /\b(?:contraindicated|(?:is |are )?not recommended|do not (?:use|take|start|give)|should not be (?:used|taken|given|coadministered|co-administered)|avoid (?:co-?administration|concomitant|use|taking)|must not)\b/i;
const CONTRAST_DYE = /\b(?:iodinated contrast|contrast (?:agents?|imaging|dye|media))\b/i;
const LEVEL_CHECK = /\b(?:monitor|check|measure)\w* (?:the )?(?:serum |plasma |blood )?(?:[\w-]+ )?(?:levels?|concentrations?)\b/i;
const SEDATION = /\brespiratory depression|profound sedation|\bcoma\b/i;
const CROSS_ALLERGY_STEP = "The label warns that people with this allergy may also react to this medicine. Tell the prescriber or pharmacist about the allergy today, before the next dose. If you have trouble breathing, swelling of the face or throat, or a severe rash, call 911.";
const SPACE_APART = /\b\d+\s*(?:to\s*\d+\s*)?hours?\s+(?:before|after|apart)\b|\bseparate\b.*\bdoses?\b/i;

function subjectOf(flag: Flag): string {
  return flag.highlight?.[0] ?? "this ingredient";
}

function mentions(flag: Flag, pattern: RegExp): boolean {
  return flag.quotes.some((quote) => pattern.test(quote.excerpt));
}

const AGE_KINDS: ReadonlySet<string> = new Set(["age", "under", "from_to", "from_to_under", "not_intended_under", "or_older"]);

function isAllergy(flag: Flag): boolean {
  return flag.matchKind === "allergen";
}

// On an interaction card only the lead quote decides, because a merged card can carry another label's
// line about a different drug. On a health card every quote is about that product and that health detail.
function quoteSaysStop(flag: Flag): boolean {
  if (flag.type === "interaction") {
    const [lead] = flag.quotes;
    return lead !== undefined && (PAIR_SAYS_STOP.test(lead.excerpt) || lead.section === "contraindications");
  }
  return flag.quotes.some((quote) => LABEL_SAYS_STOP.test(quote.excerpt) || quote.section === "contraindications");
}

const OPIOID = /\b(?:opioids?|oxycodone|hydrocodone|morphine|codeine|tramadol|fentanyl|methadone|buprenorphine|hydromorphone|oxymorphone|tapentadol|meperidine)\b/i;

function involvesOpioid(flag: Flag): boolean {
  return [flag.title, ...(flag.highlight ?? []), ...(flag.matchedBecause ?? [])].some((text) => OPIOID.test(text));
}

function leadMentions(flag: Flag, pattern: RegExp): boolean {
  const [lead] = flag.quotes;
  return lead !== undefined && pattern.test(lead.excerpt);
}

function labelSaysStop(flag: Flag): boolean {
  return flag.severity === "stop" && quoteSaysStop(flag);
}

function interactionStep(flag: Flag): string {
  if (mentions(flag, CONTRAST_DYE)) {
    return "The label says to stop this medicine at or before a scan that uses contrast dye. Tell the imaging team and the prescriber you take it, and ask when to stop it and when to restart.";
  }
  const seizureRisk = leadMentions(flag, /\bseizures?\b/i) && !leadMentions(flag, SEDATION);
  if (flag.severity === "stop" && mentions(flag, SEDATION) && !seizureRisk) {
    // Naloxone reverses opioids only, so it is offered only when an opioid is part of the pair.
    return involvesOpioid(flag)
      ? "Call the prescriber or pharmacist today to confirm these are meant to be taken together. Do not drink alcohol with them. If someone is very hard to wake or breathing slowly, give naloxone (Narcan) if you have it and call 911."
      : "Together these can cause dangerous sleepiness or slowed breathing. Do not drive or drink alcohol with them, and ask the pharmacist today whether you need both. If someone is very hard to wake or breathing slowly, call 911.";
  }
  if (flag.severity === "stop" && mentions(flag, HYPERKALEMIA)) {
    return "Ask your prescriber for a potassium blood test soon. Do not take extra potassium or a salt substitute until then. Call 911 for chest pain, a very slow or uneven heartbeat, or sudden weakness.";
  }
  if (flag.severity === "stop" && mentions(flag, BLOOD_THINNER_EFFECT)) {
    return "This can change how well the blood thinner works, which can lead to a clot or to bleeding. Do not start or stop the other product without asking the pharmacist, and ask whether you need an INR blood test. Call 911 for signs of a stroke, chest pain, or bleeding that will not stop.";
  }
  if (flag.severity !== "stop" && leadMentions(flag, /\bINR monitoring\b[^.]*\bbotanicals?\b/i)) {
    return "Tell the prescriber or pharmacist before you start or stop this supplement, and ask whether you need an INR blood test.";
  }
  if (labelSaysStop(flag) && flag.prescribed) return HOLD_DOSE;
  if ((flag.highlight ?? []).some((term) => MAOI.test(term) || /phenelzine|tranylcypromine|isocarboxazid|selegiline|rasagiline|linezolid/i.test(term))) {
    return "Do not take these within 2 weeks of an MAOI unless the doctor who prescribed it says so. Ask a pharmacist now.";
  }
  if (mentions(flag, SPACE_APART)) {
    return "The label says to space these apart. Ask a pharmacist how many hours apart to take them.";
  }
  if (flag.prescribed && flag.severity === "stop" && (mentions(flag, DOSE_CHANGE) || mentions(flag, LEVEL_CHECK))) {
    return "The label warns of serious harm with these together and says a dose may need to change or a blood level may need checking. Call the prescriber or pharmacist today, before the next dose, and ask whether that was done.";
  }
  if (flag.prescribed && (mentions(flag, DOSE_CHANGE) || mentions(flag, LEVEL_CHECK))) {
    return "The label says a dose may need to change, or a blood level may need checking, when these are taken together. Ask the prescriber or pharmacist today whether that was done. Do not change your dose yourself.";
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
      if (isAllergy(flag)) return flag.severity === "stop" ? ALLERGY_STEP : CROSS_ALLERGY_STEP;
      if (quoteSaysStop(flag)) return flag.matchKind === "pregnancy" ? HOLD_FOR_PREGNANCY : HOLD_FOR_HEALTH;
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
      if (/Reye's syndrome/.test(flag.title)) {
        return "Do not give this to a child or teenager who has or is getting over chickenpox or the flu. Ask a pharmacist for a product that is safe for them.";
      }
      if (isAllergy(flag)) {
        return flag.severity === "stop"
          ? "The label says do not use it if you are allergic to it. Do not use it. Ask a pharmacist for something else."
          : "The label warns that people with this allergy may also react to it. Ask a pharmacist before using it.";
      }
      if (flag.severity === "stop" && flag.matchKind === "pregnancy") {
        return "The label says not to use this during pregnancy unless a doctor tells you to. Ask a pharmacist for something that is safe in pregnancy.";
      }
      if (flag.severity === "stop" && AGE_KINDS.has(flag.matchKind ?? "")) {
        return "The label says not to use this at this age. Do not use it. Ask a pharmacist for a product made for this age.";
      }
      if (flag.quotes.some((quote) => quote.section === "do_not_use") || (flag.severity === "stop" && quoteSaysStop(flag))) {
        return "The label says do not use this product if this applies to you. Do not use it. Ask a pharmacist for something else.";
      }
      return flag.quotes.some((quote) => quote.section === "fda_statement")
        ? "Talk to a licensed prescriber or pharmacist before using it."
        : "Ask a doctor or pharmacist before using this, and tell them about the health detail it mentions.";
    case "label_tag":
      if (flag.title === "Alcohol" && mentions(flag, /\bdisulfiram-like\b|\balcohol (?:use )?is contraindicated/i)) {
        return "The label says not to drink alcohol with this. Do not drink any while you take it, and ask the pharmacist how long to wait after the last dose.";
      }
      if (flag.title === "Alcohol" && mentions(flag, /\bdo not (?:drink|consume)\b|\bavoid (?:drinking |consuming )?alcohol/i)) {
        return "The label says to avoid alcohol while you take this.";
      }
      if (flag.title === "Alcohol" && mentions(flag, /\b(?:respiratory depression|coma|death|fatal)\b/i)) {
        return "Do not drink alcohol while taking this. The label warns that together they can slow breathing, which can be fatal.";
      }
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

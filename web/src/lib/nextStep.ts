import type { Flag } from "./model";

function subjectOf(flag: Flag): string {
  return flag.highlight?.[0] ?? "this ingredient";
}

export function nextStep(flag: Flag): string {
  switch (flag.type) {
    case "duplicate_ingredient":
      return `Take only one product with ${subjectOf(flag)} at a time, unless a pharmacist tells you otherwise.`;
    case "daily_total":
      return "Do not take these at their full doses on the same day. Ask a pharmacist how much is right for you.";
    case "interaction":
      return "Ask a pharmacist before taking these on the same day. Show them the quoted line.";
    case "profile":
      return flag.quotes.some((quote) => quote.section === "fda_statement")
        ? "Talk to a licensed prescriber or pharmacist before using it."
        : "Ask a doctor or pharmacist before using this, and tell them about the health detail it mentions.";
    case "label_tag":
      return "Read the quoted line before you combine this with what it mentions.";
    case "recall":
      return "Compare the lot number on your bottle with the recall. If it matches, stop using it and call your pharmacy.";
    case "expiry":
      return flag.severity === "stop" ? "Do not rely on it. Ask a pharmacist about replacing it." : "Plan to replace it soon.";
    case "refill":
      return "Order a refill before it runs out.";
    default:
      return "Show this to a pharmacist before you change what you take.";
  }
}

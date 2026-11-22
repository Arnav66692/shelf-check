export const LABEL_ONLY_NOTE = "This page only quotes the FDA label. Ask your pharmacist or doctor about your own case.";

export function learnHref(setId: string): string {
  return `/learn/${encodeURIComponent(setId.toLowerCase())}`;
}

export function twoDigits(position: number): string {
  return String(position).padStart(2, "0");
}

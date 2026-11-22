import type { Flag, Product } from "./model";
import type { Supply } from "./store";

const MONTH_SHAPE = /^(\d{4})-(\d{2})$/;
const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;
const LOW_SUPPLY_DAYS = 7;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type CountedSupply = Supply & { readonly countedOn?: string };

function monthName(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function todayIso(): string {
  return isoOf(new Date());
}

function dayNumber(iso: string): number | null {
  const match = DAY_SHAPE.exec(iso);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MILLISECONDS_PER_DAY;
}

export function countedDate(supply: CountedSupply): string | null {
  const match = supply.countedOn ? DAY_SHAPE.exec(supply.countedOn) : null;
  if (!match) return null;
  return `${MONTH_NAMES[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
}

function expiryFlag(product: Product, expires: string, today: Date): Flag | null {
  const match = MONTH_SHAPE.exec(expires);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthsLeft = (year - today.getFullYear()) * 12 + (month - (today.getMonth() + 1));
  if (monthsLeft > 1) return null;
  const expired = monthsLeft < 0;
  return {
    id: `expiry:${product.id}`,
    type: "expiry",
    severity: expired ? "stop" : "ask",
    prescribed: product.kind === "rx",
    title: expired ? `${product.displayName} has expired` : `${product.displayName} expires soon`,
    explain: expired
      ? `The expiry date you entered was ${monthName(year, month)}.`
      : `The expiry date you entered is ${monthName(year, month)}.`,
    itemIds: [product.id],
    quotes: [],
  };
}

function refillFlag(product: Product, supply: CountedSupply, today: Date): Flag | null {
  const { dosesLeft, dosesPerDay } = supply;
  if (dosesLeft === undefined || dosesPerDay === undefined || !(dosesPerDay > 0) || dosesLeft < 0) return null;
  const counted = supply.countedOn ? dayNumber(supply.countedOn) : null;
  const now = dayNumber(isoOf(today));
  const base = { id: `refill:${product.id}`, type: "refill", severity: "info", itemIds: [product.id], quotes: [] } as const;
  if (counted === null || now === null) {
    const daysThen = Math.floor(dosesLeft / dosesPerDay);
    if (daysThen > LOW_SUPPLY_DAYS) return null;
    return {
      ...base,
      title: `${product.displayName} may be running low`,
      explain: `You entered ${dosesLeft} left at ${dosesPerDay} a day, which was about ${daysThen} ${daysThen === 1 ? "day" : "days"} of supply when you counted. The count has no date, so count again to get a current estimate.`,
    };
  }
  const elapsed = Math.max(0, now - counted);
  const left = Math.max(0, dosesLeft - elapsed * dosesPerDay);
  const days = Math.floor(left / dosesPerDay);
  if (days > LOW_SUPPLY_DAYS) return null;
  const when = countedDate(supply);
  return {
    ...base,
    title: days === 0 ? `${product.displayName} may run out today` : `${product.displayName} may run out in ${days} ${days === 1 ? "day" : "days"}`,
    explain: `You counted ${dosesLeft} left at ${dosesPerDay} a day on ${when}. This estimate counts from that day, so count again if it is off.`,
  };
}

export function supplyFlags(items: readonly Product[], supply: Readonly<Record<string, CountedSupply>>, today: Date): readonly Flag[] {
  return items.flatMap((item) => {
    const entry = supply[item.id];
    if (!entry) return [];
    const flags = [entry.expires ? expiryFlag(item, entry.expires, today) : null, refillFlag(item, entry, today)];
    return flags.filter((flag): flag is Flag => flag !== null);
  });
}

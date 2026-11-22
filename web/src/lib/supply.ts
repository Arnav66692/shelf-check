import type { Flag, Product } from "./model";
import type { Supply } from "./store";

const MONTH_SHAPE = /^(\d{4})-(\d{2})$/;
const LOW_SUPPLY_DAYS = 7;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthName(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
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

function refillFlag(product: Product, supply: Supply): Flag | null {
  const { dosesLeft, dosesPerDay } = supply;
  if (dosesLeft === undefined || dosesPerDay === undefined || !(dosesPerDay > 0) || dosesLeft < 0) return null;
  const days = Math.floor(dosesLeft / dosesPerDay);
  if (days > LOW_SUPPLY_DAYS) return null;
  return {
    id: `refill:${product.id}`,
    type: "refill",
    severity: "info",
    title: days === 0 ? `${product.displayName} runs out today` : `${product.displayName} runs out in ${days} ${days === 1 ? "day" : "days"}`,
    explain: `You entered ${dosesLeft} left at ${dosesPerDay} a day.`,
    itemIds: [product.id],
    quotes: [],
  };
}

export function supplyFlags(items: readonly Product[], supply: Readonly<Record<string, Supply>>, today: Date): readonly Flag[] {
  return items.flatMap((item) => {
    const entry = supply[item.id];
    if (!entry) return [];
    const flags = [entry.expires ? expiryFlag(item, entry.expires, today) : null, refillFlag(item, entry)];
    return flags.filter((flag): flag is Flag => flag !== null);
  });
}

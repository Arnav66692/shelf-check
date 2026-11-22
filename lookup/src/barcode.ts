import { packageNdcSplits } from "./ndc.ts";

export type BarcodeParse =
  | {
      readonly kind: "gtin";
      readonly searchUpc: string;
      readonly upcA?: string;
      readonly ndcCandidates: readonly string[];
    }
  | { readonly kind: "invalid"; readonly reason: string; readonly reasonCode?: "invalid_checksum" };

const UPC_A_LENGTH = 12;
const EAN_13_LENGTH = 13;
const GTIN_14_LENGTH = 14;
const UPC_E_LENGTH = 8;
const NDC_UPC_PREFIX = "3";

export function hasValidCheckDigit(digits: string): boolean {
  const values = [...digits].map(Number).reverse();
  const [check = 0, ...payload] = values;
  const sum = payload.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function toUpcA(digits: string): string | undefined {
  if (digits.length === UPC_A_LENGTH) return digits;
  if (digits.length === EAN_13_LENGTH && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === GTIN_14_LENGTH && digits.startsWith("00")) return digits.slice(2);
  return undefined;
}

export function dsldBarcodeQuery(upcA: string): string {
  return `"${upcA.slice(0, 1)} ${upcA.slice(1, 6)} ${upcA.slice(6, 11)} ${upcA.slice(11)}"`;
}

export function parseBarcode(text: string): BarcodeParse {
  const digits = text.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits)) return { kind: "invalid", reason: "A barcode has only digits." };
  if (digits.length === UPC_E_LENGTH) {
    return { kind: "invalid", reason: "Short 8-digit barcodes are not supported. Type the drug code or search by name." };
  }
  const upcA = toUpcA(digits);
  if (upcA === undefined && digits.length !== EAN_13_LENGTH) {
    return { kind: "invalid", reason: `A barcode has 12, 13 or 14 digits, this one has ${digits.length}.` };
  }
  if (!hasValidCheckDigit(digits)) {
    return { kind: "invalid", reasonCode: "invalid_checksum", reason: "The last digit does not match the rest of the barcode. Scan it again." };
  }
  if (upcA === undefined) return { kind: "gtin", searchUpc: digits, ndcCandidates: [] };
  return {
    kind: "gtin",
    searchUpc: upcA.padStart(EAN_13_LENGTH, "0"),
    upcA,
    ndcCandidates: upcA.startsWith(NDC_UPC_PREFIX) ? packageNdcSplits(upcA.slice(1, 11)) : [],
  };
}

export type NdcLevel = "product" | "package";

export type NdcParse =
  | { readonly kind: NdcLevel; readonly candidates: readonly string[] }
  | { readonly kind: "invalid"; readonly reason: string };

const UPC_LENGTH = 12;
const BILLING_LENGTH = 11;
const PACKAGE_LENGTH = 10;
const PACKAGE_SPLITS: readonly (readonly [number, number])[] = [
  [4, 4],
  [5, 3],
  [5, 4],
];

function invalid(reason: string): NdcParse {
  return { kind: "invalid", reason };
}

export function packageNdcSplits(tenDigits: string): readonly string[] {
  return PACKAGE_SPLITS.map(
    ([labeler, product]) =>
      `${tenDigits.slice(0, labeler)}-${tenDigits.slice(labeler, labeler + product)}-${tenDigits.slice(labeler + product)}`,
  );
}

function unpadBilling(labeler: string, product: string, packageCode: string | undefined): readonly string[] {
  const tail = packageCode === undefined ? "" : `-${packageCode}`;
  return [
    ...(labeler.startsWith("0") ? [`${labeler.slice(1)}-${product}${tail}`] : []),
    ...(product.startsWith("0") ? [`${labeler}-${product.slice(1)}${tail}`] : []),
    ...(packageCode?.startsWith("0") ? [`${labeler}-${product}-${packageCode.slice(1)}`] : []),
  ];
}

function fromBareDigits(digits: string): NdcParse {
  if (digits.length === PACKAGE_LENGTH) return { kind: "package", candidates: packageNdcSplits(digits) };
  if (digits.length === BILLING_LENGTH) {
    const candidates = unpadBilling(digits.slice(0, 5), digits.slice(5, 9), digits.slice(9));
    return candidates.length > 0
      ? { kind: "package", candidates }
      : invalid("An 11-digit drug code must have a padding zero at the start of one of its 5-4-2 parts.");
  }
  if (digits.length === 8) {
    return { kind: "product", candidates: [`${digits.slice(0, 4)}-${digits.slice(4)}`, `${digits.slice(0, 5)}-${digits.slice(5)}`] };
  }
  if (digits.length === 9) return { kind: "product", candidates: [`${digits.slice(0, 5)}-${digits.slice(5)}`] };
  if (digits.length >= UPC_LENGTH) return invalid(`${digits.length} digits looks like a barcode, not a drug code. Use the barcode lookup.`);
  return invalid(`A drug code has 8 to 11 digits, this one has ${digits.length}.`);
}

function fromTwoParts(labeler: string, product: string): NdcParse {
  const shape = `${labeler.length}-${product.length}`;
  if (shape === "4-4" || shape === "5-3") return { kind: "product", candidates: [`${labeler}-${product}`] };
  if (shape === "5-4") return { kind: "product", candidates: [`${labeler}-${product}`, ...unpadBilling(labeler, product, undefined)] };
  return invalid(`A two-part drug code is 4-4, 5-3 or 5-4 digits, this one is ${shape}.`);
}

function fromThreeParts(labeler: string, product: string, packageCode: string): NdcParse {
  const shape = `${labeler.length}-${product.length}-${packageCode.length}`;
  if (shape === "4-4-2" || shape === "5-3-2" || shape === "5-4-1") {
    return { kind: "package", candidates: [`${labeler}-${product}-${packageCode}`] };
  }
  if (shape === "5-4-2") {
    const candidates = unpadBilling(labeler, product, packageCode);
    return candidates.length > 0
      ? { kind: "package", candidates }
      : invalid("An 11-digit drug code must have a padding zero at the start of one of its 5-4-2 parts.");
  }
  return invalid(`A three-part drug code is 4-4-2, 5-3-2, 5-4-1 or 5-4-2 digits, this one is ${shape}.`);
}

export function parseNdc(text: string): NdcParse {
  const cleaned = text
    .replace(/ndc/gi, " ")
    .replace(/[:#.]/g, " ")
    .trim()
    .replace(/[\s‐-―_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (cleaned === "") return invalid("No drug code was given.");
  if (!/^[\d-]+$/.test(cleaned)) return invalid("A drug code has only digits and hyphens.");
  const [first = "", second, third, ...rest] = cleaned.split("-");
  if (rest.length > 0) return invalid("A drug code has at most three parts.");
  if (second === undefined) return fromBareDigits(first);
  if (third === undefined) return fromTwoParts(first, second);
  return fromThreeParts(first, second, third);
}

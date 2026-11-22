export type ScanFormat = "upc_a" | "ean_13";

export type Scan = { digits: string; format: ScanFormat };

export type ReadStreak = { pending: string | null; confirmed: string | null };

const UPC_A_LENGTH = 12;
const EAN_13_LENGTH = 13;

function hasValidCheckDigit(digits: string, length: number): boolean {
  if (digits.length !== length || !/^\d+$/.test(digits)) return false;
  let sum = 0;
  for (let fromRight = 1; fromRight < length; fromRight += 1) {
    const digit = digits.charCodeAt(length - 1 - fromRight) - 48;
    sum += fromRight % 2 === 1 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10 === digits.charCodeAt(length - 1) - 48;
}

export function isValidUpcA(digits: string): boolean {
  return hasValidCheckDigit(digits, UPC_A_LENGTH);
}

export function isValidEan13(digits: string): boolean {
  return hasValidCheckDigit(digits, EAN_13_LENGTH);
}

export function normaliseScan(raw: string): Scan | null {
  const digits = raw.replace(/\s+/g, "");
  if (isValidUpcA(digits)) return { digits, format: "upc_a" };
  if (!isValidEan13(digits)) return null;
  // An EAN-13 that starts with 0 is the same printed bars as a UPC-A, and decoders disagree on which one they report.
  if (digits.startsWith("0")) return { digits: digits.slice(1), format: "upc_a" };
  return { digits, format: "ean_13" };
}

export function confirmRead(pending: string | null, raw: string): ReadStreak {
  const scan = normaliseScan(raw);
  if (!scan) return { pending: null, confirmed: null };
  if (scan.digits === pending) return { pending: null, confirmed: scan.digits };
  return { pending: scan.digits, confirmed: null };
}

async function loadReader() {
  const zxing = await import("@zxing/library");
  const hints = new Map<import("@zxing/library").DecodeHintType, unknown>([
    [zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.UPC_A, zxing.BarcodeFormat.EAN_13]],
    [zxing.DecodeHintType.TRY_HARDER, true],
  ]);
  return { zxing, hints, reader: new zxing.MultiFormatOneDReader(hints) };
}

type LoadedReader = Awaited<ReturnType<typeof loadReader>>;

let readerLoad: Promise<LoadedReader> | null = null;

function getReader(): Promise<LoadedReader> {
  readerLoad ??= loadReader().catch((error: unknown) => {
    readerLoad = null;
    throw error;
  });
  return readerLoad;
}

function toLuminance(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const luminance = new Uint8ClampedArray(width * height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4;
    luminance[pixel] = (rgba[offset] + 2 * rgba[offset + 1] + rgba[offset + 2]) >> 2;
  }
  return luminance;
}

function quarterTurn(luminance: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const turned = new Uint8ClampedArray(luminance.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      turned[x * height + (height - 1 - y)] = luminance[y * width + x];
    }
  }
  return turned;
}

function readLuminance(loaded: LoadedReader, luminance: Uint8ClampedArray, width: number, height: number): string | null {
  const { zxing, hints, reader } = loaded;
  const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(luminance, width, height)));
  try {
    return reader.decode(bitmap, hints).getText();
  } catch (error) {
    if (error instanceof zxing.NotFoundException) return null;
    throw error;
  }
}

export async function decodeRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: { tryRotated?: boolean } = {},
): Promise<string | null> {
  if (rgba.length !== width * height * 4) {
    throw new RangeError(`Expected ${width * height * 4} RGBA bytes for ${width} by ${height} pixels, got ${rgba.length}.`);
  }
  const loaded = await getReader();
  const luminance = toLuminance(rgba, width, height);
  const upright = readLuminance(loaded, luminance, width, height);
  if (upright !== null || !options.tryRotated) return upright;
  return readLuminance(loaded, quarterTurn(luminance, width, height), height, width);
}

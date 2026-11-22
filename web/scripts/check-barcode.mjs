import { confirmRead, decodeRgba, isValidEan13, isValidUpcA, normaliseScan } from "../src/lib/barcode.ts";

const LEFT_ODD = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const FIRST_DIGIT_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
const QUIET_MODULES = 12;
const BAR_HEIGHT = 120;
const MARGIN_ROWS = 20;

const invert = (bits) => [...bits].map((bit) => (bit === "1" ? "0" : "1")).join("");
const reverse = (bits) => [...bits].reverse().join("");

function ean13Modules(digits) {
  const parity = FIRST_DIGIT_PARITY[Number(digits[0])];
  const left = [...digits.slice(1, 7)].map((digit, index) => {
    const odd = LEFT_ODD[Number(digit)];
    return parity[index] === "L" ? odd : reverse(invert(odd));
  });
  const right = [...digits.slice(7)].map((digit) => invert(LEFT_ODD[Number(digit)]));
  return `101${left.join("")}01010${right.join("")}101`;
}

function modulesFor(digits) {
  return ean13Modules(digits.length === 12 ? `0${digits}` : digits);
}

function drawBarcode(digits, { moduleWidth = 3, ink = 0, paper = 255 } = {}) {
  const quiet = "0".repeat(QUIET_MODULES);
  const modules = `${quiet}${modulesFor(digits)}${quiet}`;
  const width = modules.length * moduleWidth;
  const height = BAR_HEIGHT + MARGIN_ROWS * 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const inBars = y >= MARGIN_ROWS && y < MARGIN_ROWS + BAR_HEIGHT;
    for (let x = 0; x < width; x += 1) {
      const shade = inBars && modules[Math.floor(x / moduleWidth)] === "1" ? ink : paper;
      rgba.set([shade, shade, shade, 255], (y * width + x) * 4);
    }
  }
  return { rgba, width, height };
}

function turnSideways({ rgba, width, height }) {
  const turned = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      turned.set(rgba.subarray(from, from + 4), (x * height + (height - 1 - y)) * 4);
    }
  }
  return { rgba: turned, width: height, height: width };
}

function addNoise({ rgba, width, height }, amount) {
  let seed = 20261121;
  const noisy = rgba.map((value, index) => {
    if (index % 4 === 3) return value;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return value + ((seed / 2 ** 32) * 2 - 1) * amount;
  });
  return { rgba: noisy, width, height };
}

const decode = ({ rgba, width, height }, options) => decodeRgba(rgba, width, height, options);

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

const cases = [
  ["decode image UPC-A 300931713018", () => decode(drawBarcode("300931713018")), "300931713018"],
  ["decode image UPC-A 385096301300", () => decode(drawBarcode("385096301300")), "385096301300"],
  ["decode image EAN-13 4006381333931", () => decode(drawBarcode("4006381333931")), "4006381333931"],
  ["decode image with thin 2 pixel bars", () => decode(drawBarcode("385096301300", { moduleWidth: 2 })), "385096301300"],
  ["decode grey noisy image", () => decode(addNoise(drawBarcode("300931713018", { ink: 70, paper: 190 }), 30)), "300931713018"],
  ["decode sideways photo when rotation is tried", () => decode(turnSideways(drawBarcode("4006381333931")), { tryRotated: true }), "4006381333931"],
  ["sideways image is not read without rotation", () => decode(turnSideways(drawBarcode("4006381333931"))), null],
  ["blank image gives no barcode", () => decode({ rgba: new Uint8ClampedArray(300 * 100 * 4).fill(255), width: 300, height: 100 }), null],
  ["image with a bad check digit is rejected by the decoder", () => decode(drawBarcode("300931713019")), null],
  ["wrong buffer size throws", () => decodeRgba(new Uint8ClampedArray(10), 4, 4).then(() => "no error", (error) => error.name), "RangeError"],

  ["isValidUpcA accepts 300931713018", () => isValidUpcA("300931713018"), true],
  ["isValidUpcA accepts 385096301300", () => isValidUpcA("385096301300"), true],
  ["isValidUpcA rejects bad check digit 300931713019", () => isValidUpcA("300931713019"), false],
  ["isValidUpcA rejects two swapped digits 300931713081", () => isValidUpcA("300931713081"), false],
  ["isValidUpcA rejects 11 digits", () => isValidUpcA("30093171301"), false],
  ["isValidUpcA rejects letters", () => isValidUpcA("30093171301X"), false],
  ["isValidEan13 accepts 4006381333931", () => isValidEan13("4006381333931"), true],
  ["isValidEan13 rejects bad check digit 4006381333932", () => isValidEan13("4006381333932"), false],
  ["isValidEan13 rejects a 12 digit UPC-A", () => isValidEan13("300931713018"), false],

  ["normaliseScan strips spaces", () => normaliseScan(" 3 00931 71301 8 "), { digits: "300931713018", format: "upc_a" }],
  ["normaliseScan keeps a real EAN-13", () => normaliseScan("4006381333931"), { digits: "4006381333931", format: "ean_13" }],
  ["normaliseScan turns 0 plus UPC-A into the UPC-A", () => normaliseScan("0300931713018"), { digits: "300931713018", format: "upc_a" }],
  ["normaliseScan rejects a bad check digit", () => normaliseScan("300931713019"), null],
  ["normaliseScan rejects a bad EAN-13 check digit", () => normaliseScan("4006381333930"), null],
  ["normaliseScan rejects other lengths", () => normaliseScan("12345670"), null],
  ["normaliseScan rejects empty text", () => normaliseScan("   "), null],

  ["confirmRead holds the first read", () => confirmRead(null, "300931713018"), { pending: "300931713018", confirmed: null }],
  ["confirmRead confirms the same digits twice", () => confirmRead("300931713018", "300931713018"), { pending: null, confirmed: "300931713018" }],
  ["confirmRead treats 0 plus UPC-A as the same digits", () => confirmRead("300931713018", "0300931713018"), { pending: null, confirmed: "300931713018" }],
  ["confirmRead starts over on different digits", () => confirmRead("300931713018", "385096301300"), { pending: "385096301300", confirmed: null }],
  ["confirmRead drops a misread", () => confirmRead("300931713018", "300931713019"), { pending: null, confirmed: null }],
];

let failures = 0;
for (const [name, run, expected] of cases) {
  let actual;
  try {
    actual = await run();
  } catch (error) {
    actual = `threw ${error}`;
  }
  if (same(actual, expected)) {
    console.log(`PASS ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log(failures === 0 ? `All ${cases.length} checks passed.` : `${failures} of ${cases.length} checks failed.`);
process.exitCode = failures === 0 ? 0 : 1;

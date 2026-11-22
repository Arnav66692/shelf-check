import { closeSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { gunzipSync, inflateRawSync } from "node:zlib";
import { isRecord, stringField } from "../src/sources/http.ts";
import { encodePillFile, normaliseImprint, parsePillFile, pillColors, pillShapes } from "../src/pills.ts";
import type { PillboxImageEntry, PillFile, PillKind, PillRecord, PillSource } from "../src/pills.ts";

const FIXTURE_DIR = fileURLToPath(new URL("../fixtures/pills/", import.meta.url));
const PILLBOX_PAGES = ["pillbox-page-0.json.gz", "pillbox-page-1.json.gz"];
const PILLBOX_IMAGE_DIRECTORY = `${FIXTURE_DIR}pillbox-images-central-directory.bin`;
const DEFAULT_DAILYMED_ZIP = fileURLToPath(new URL("../../data/dm_spl_monthly_update_oct2026.zip", import.meta.url));
const OUTPUT_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const OUTPUT_PATH = `${OUTPUT_DIR}pills.json`;
const MAX_OUTPUT_BYTES = 15 * 1024 * 1024;

const PILLBOX_URL = "https://datadiscovery.nlm.nih.gov/resource/crzr-uvwg.json";
const PILLBOX_IMAGE_ZIP_URL = "https://ftp.nlm.nih.gov/projects/pillbox/pillbox_production_images_full_202008.zip";
const DAILYMED_URL = "https://dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm";
const PRODUCT_DATA_SECTION = "48780-1";
const NDC_SYSTEM = "2.16.840.1.113883.6.69";
const ACTIVE_CLASSES = new Set(["ACTIB", "ACTIM", "ACTIR"]);

const PILLBOX_KINDS: Readonly<Record<string, PillKind>> = {
  HRX: "prescription",
  HOTC: "otc",
  HOMEO: "homeopathic",
  ANIMAL: "animal",
  REMAIN: "other",
};

const DAILYMED_KINDS: Readonly<Record<string, PillKind>> = {
  prescription: "prescription",
  otc: "otc",
  homeopathic: "homeopathic",
  animal: "animal",
  other: "other",
};

class PillSourceError extends Error {
  constructor(problem: string) {
    super(`Cannot build the pill file: ${problem}.`);
    this.name = "PillSourceError";
  }
}

interface ZipEntry {
  readonly name: string;
  readonly method: number;
  readonly compressedSize: number;
  readonly localHeaderOffset: number;
}

type ReadAt = (offset: number, length: number) => Buffer;

const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const LOCAL_SIGNATURE = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

function parseCentralDirectory(directory: Buffer): readonly ZipEntry[] {
  const entries: ZipEntry[] = [];
  let at = 0;
  while (at + 46 <= directory.length && directory.readUInt32LE(at) === CENTRAL_SIGNATURE) {
    const nameLength = directory.readUInt16LE(at + 28);
    const extraLength = directory.readUInt16LE(at + 30);
    const commentLength = directory.readUInt16LE(at + 32);
    entries.push({
      name: directory.toString("utf8", at + 46, at + 46 + nameLength),
      method: directory.readUInt16LE(at + 10),
      compressedSize: directory.readUInt32LE(at + 20),
      localHeaderOffset: directory.readUInt32LE(at + 42),
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function zipDirectory(read: ReadAt, totalSize: number): readonly ZipEntry[] {
  const tailLength = Math.min(totalSize, 65_557);
  const tail = read(totalSize - tailLength, tailLength);
  for (let at = tail.length - 22; at >= 0; at -= 1) {
    if (tail.readUInt32LE(at) !== END_SIGNATURE) continue;
    const size = tail.readUInt32LE(at + 12);
    const offset = tail.readUInt32LE(at + 16);
    return parseCentralDirectory(read(offset, size));
  }
  throw new PillSourceError("a zip file has no end-of-directory record");
}

function zipEntryBytes(read: ReadAt, entry: ZipEntry): Buffer {
  const header = read(entry.localHeaderOffset, 30);
  if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new PillSourceError(`zip entry ${entry.name} has no local header`);
  const dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const data = read(dataStart, entry.compressedSize);
  if (entry.method === STORED) return data;
  if (entry.method === DEFLATED) return inflateRawSync(data);
  throw new PillSourceError(`zip entry ${entry.name} uses compression method ${entry.method}`);
}

function bufferReader(buffer: Buffer): ReadAt {
  return (offset, length) => buffer.subarray(offset, offset + length);
}

interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlElement[];
  text: string;
}

const XML_TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
const XML_ATTRIBUTE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const XML_ENTITIES: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlText(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? whole;
  });
}

function localName(name: string): string {
  return name.slice(name.indexOf(":") + 1);
}

function parseXml(xml: string): XmlElement {
  const root: XmlElement = { name: "#root", attributes: {}, children: [], text: "" };
  const open: XmlElement[] = [root];
  for (const token of xml.matchAll(XML_TOKEN)) {
    const [, cdata, closing, opening, attributeText, selfClosing, text] = token;
    const current = open[open.length - 1] ?? root;
    if (opening !== undefined) {
      const attributes = Object.fromEntries(
        [...(attributeText ?? "").matchAll(XML_ATTRIBUTE)].map(([, key, double, single]) => [
          localName(key ?? ""),
          decodeXmlText(double ?? single ?? ""),
        ]),
      );
      const element: XmlElement = { name: localName(opening), attributes, children: [], text: "" };
      current.children.push(element);
      if (selfClosing !== "/") open.push(element);
    } else if (closing !== undefined) {
      open.pop();
    } else if (text !== undefined) {
      current.text += decodeXmlText(text);
    } else if (cdata !== undefined) {
      current.text += cdata;
    }
  }
  const document = root.children[0];
  if (document === undefined) throw new PillSourceError("an SPL file has no root element");
  return document;
}

function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((candidate) => candidate.name === name);
}

function children(element: XmlElement | undefined, name: string): readonly XmlElement[] {
  return element?.children.filter((candidate) => candidate.name === name) ?? [];
}

function path(element: XmlElement | undefined, ...names: readonly string[]): XmlElement | undefined {
  return names.reduce<XmlElement | undefined>((found, name) => child(found, name), element);
}

function allText(element: XmlElement | undefined): string {
  if (element === undefined) return "";
  return `${element.text} ${element.children.map(allText).join(" ")}`.replace(/\s+/g, " ").trim();
}

function descendants(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.flatMap((found) => [...(found.name === name ? [found] : []), ...descendants(found, name)]);
}

function splDate(compact: string | undefined, where: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(compact ?? "");
  if (match === null) throw new PillSourceError(`${where} has date "${compact ?? "missing"}"`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

interface Characteristics {
  readonly imprint: string;
  readonly colors: readonly string[];
  readonly shape: string;
  readonly sizeMm?: number;
  readonly score?: number;
  readonly splImage?: string;
}

function numberValue(value: XmlElement | undefined): number | undefined {
  const parsed = Number(value?.attributes["value"]);
  return value?.attributes["value"] === undefined || !Number.isFinite(parsed) ? undefined : parsed;
}

function readCharacteristics(holder: XmlElement): Characteristics | undefined {
  const found = children(holder, "subjectOf")
    .map((subject) => child(subject, "characteristic"))
    .filter((characteristic): characteristic is XmlElement => characteristic !== undefined)
    .map((characteristic) => ({ code: child(characteristic, "code")?.attributes["code"], value: child(characteristic, "value") }));
  const valuesOf = (code: string) => found.filter((entry) => entry.code === code).map((entry) => entry.value);
  const imprint = valuesOf("SPLIMPRINT").map((value) => allText(value)).filter((text) => text !== "")[0] ?? "";
  const shape = (valuesOf("SPLSHAPE")[0]?.attributes["displayName"] ?? "").trim().toUpperCase();
  if (imprint === "" && shape === "") return undefined;
  const sizeMm = numberValue(valuesOf("SPLSIZE")[0]);
  const score = numberValue(valuesOf("SPLSCORE")[0]);
  const splImage = path(valuesOf("SPLIMAGE")[0], "reference")?.attributes["value"];
  return {
    imprint,
    colors: valuesOf("SPLCOLOR")
      .map((value) => (value?.attributes["displayName"] ?? "").trim().toUpperCase())
      .filter((color) => color !== ""),
    shape,
    ...(sizeMm === undefined ? {} : { sizeMm }),
    ...(score === undefined ? {} : { score }),
    ...(splImage === undefined ? {} : { splImage }),
  };
}

function strengthOf(product: XmlElement | undefined): string {
  return children(product, "ingredient")
    .filter((ingredient) => ACTIVE_CLASSES.has(ingredient.attributes["classCode"] ?? ""))
    .map((ingredient) => {
      const name = allText(path(ingredient, "ingredientSubstance", "name"));
      const numerator = path(ingredient, "quantity", "numerator");
      const value = numerator?.attributes["value"];
      const unit = numerator?.attributes["unit"];
      return value === undefined ? name : `${name} ${value} ${unit === undefined || unit === "1" ? "" : unit}`.trim();
    })
    .filter((line) => line !== "")
    .join("; ");
}

function ndcOf(product: XmlElement | undefined): string | undefined {
  const code = child(product, "code");
  return code?.attributes["codeSystem"] === NDC_SYSTEM ? code.attributes["code"] : undefined;
}

interface SplLabel {
  readonly setId: string;
  readonly date: string;
  readonly maker: string;
  readonly kind: PillKind;
}

function recordsFromProduct(outer: XmlElement, label: SplLabel): readonly PillRecord[] {
  const inner = child(outer, "manufacturedProduct");
  const ndc = ndcOf(inner);
  if (inner === undefined || ndc === undefined) return [];
  const toRecord = (part: number, product: XmlElement | undefined, traits: Characteristics): PillRecord => ({
    ndc,
    part,
    name: allText(child(product, "name")) || allText(child(inner, "name")),
    strength: strengthOf(product),
    maker: label.maker,
    ...traits,
    setId: label.setId,
    source: "dailymed",
    date: label.date,
    kind: label.kind,
  });
  const whole = readCharacteristics(outer);
  const parts = children(inner, "part").flatMap((part, index): readonly PillRecord[] => {
    const traits = readCharacteristics(part);
    return traits === undefined ? [] : [toRecord(index + 1, child(part, "partProduct"), traits)];
  });
  return [...(whole === undefined ? [] : [toRecord(0, inner, whole)]), ...parts];
}

function recordsFromSpl(xml: string, kind: PillKind, where: string): readonly PillRecord[] {
  const document = parseXml(xml);
  const setId = child(document, "setId")?.attributes["root"];
  if (setId === undefined) throw new PillSourceError(`${where} has no setId`);
  const label: SplLabel = {
    setId,
    date: splDate(child(document, "effectiveTime")?.attributes["value"], where),
    maker: allText(path(document, "author", "assignedEntity", "representedOrganization", "name")).replace(/[,\s]+$/, ""),
    kind,
  };
  return descendants(document, "section")
    .filter((section) => child(section, "code")?.attributes["code"] === PRODUCT_DATA_SECTION)
    .flatMap((section) => children(section, "subject"))
    .flatMap((subject) => children(subject, "manufacturedProduct"))
    .flatMap((outer) => recordsFromProduct(outer, label));
}

function readDailyMed(zipPath: string): { readonly records: readonly PillRecord[]; readonly labels: number } {
  const handle = openSync(zipPath, "r");
  try {
    const read: ReadAt = (offset, length) => {
      const buffer = Buffer.alloc(length);
      readSync(handle, buffer, 0, length, offset);
      return buffer;
    };
    const labelZips = zipDirectory(read, fstatSync(handle).size).filter((entry) => entry.name.endsWith(".zip"));
    const records = labelZips.flatMap((entry) => {
      const kind = DAILYMED_KINDS[entry.name.split("/")[0] ?? ""];
      if (kind === undefined) return [];
      const inner = zipEntryBytes(read, entry);
      const innerRead = bufferReader(inner);
      return zipDirectory(innerRead, inner.length)
        .filter((file) => file.name.endsWith(".xml"))
        .flatMap((file) => recordsFromSpl(zipEntryBytes(innerRead, file).toString("utf8"), kind, `${entry.name}/${file.name}`));
    });
    return { records, labels: labelZips.length };
  } finally {
    closeSync(handle);
  }
}

function pillboxImages(): ReadonlyMap<string, PillboxImageEntry> {
  return new Map(
    parseCentralDirectory(readFileSync(PILLBOX_IMAGE_DIRECTORY))
      .filter((entry) => entry.name.endsWith(".jpg"))
      .map((entry) => [entry.name.slice(0, -".jpg".length), { offset: entry.localHeaderOffset, compressedSize: entry.compressedSize }]),
  );
}

function optionalNumber(text: string | undefined): number | undefined {
  const parsed = Number(text);
  return text === undefined || text === "" || !Number.isFinite(parsed) ? undefined : parsed;
}

function pillboxRecord(raw: Record<string, unknown>, images: ReadonlyMap<string, PillboxImageEntry>): PillRecord | undefined {
  const where = `Pillbox record ${stringField(raw, "id") ?? "?"}`;
  const ndc = stringField(raw, "product_code");
  const setId = stringField(raw, "setid");
  const updatedAt = stringField(raw, "updated_at");
  const kind = PILLBOX_KINDS[stringField(raw, "source") ?? ""];
  if (ndc === undefined || setId === undefined || updatedAt === undefined || kind === undefined) {
    throw new PillSourceError(`${where} lacks product_code, setid, updated_at or source`);
  }
  const imprint = stringField(raw, "splimprint") ?? "";
  const shape = (stringField(raw, "splshape_text") ?? "").trim().toUpperCase();
  if (imprint === "" && shape === "") return undefined;
  const image = stringField(raw, "has_image") === "True" ? stringField(raw, "splimage") : undefined;
  const sizeMm = optionalNumber(stringField(raw, "splsize"));
  const score = optionalNumber(stringField(raw, "splscore"));
  return {
    ndc,
    part: optionalNumber(stringField(raw, "part_num")) ?? 0,
    name: stringField(raw, "medicine_name") ?? "",
    strength: (stringField(raw, "spl_strength") ?? "")
      .split(";")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .join("; "),
    maker: stringField(raw, "author") ?? "",
    imprint,
    colors: (stringField(raw, "splcolor_text") ?? "")
      .split(";")
      .map((color) => color.trim().toUpperCase())
      .filter((color) => color !== ""),
    shape,
    ...(sizeMm === undefined ? {} : { sizeMm }),
    ...(score === undefined ? {} : { score }),
    setId,
    source: "pillbox",
    date: updatedAt.slice(0, 10),
    kind,
    ...(image !== undefined && images.has(image) ? { pillboxImage: image } : {}),
  };
}

function productKey(record: PillRecord): string {
  return `${record.ndc}#${record.part}`;
}

function newestPerProduct(records: readonly PillRecord[]): ReadonlyMap<string, PillRecord> {
  const kept = new Map<string, PillRecord>();
  for (const record of records) {
    const held = kept.get(productKey(record));
    if (held === undefined || record.date > held.date) kept.set(productKey(record), record);
  }
  return kept;
}

function readPillbox(images: ReadonlyMap<string, PillboxImageEntry>): { readonly raw: number; readonly records: readonly PillRecord[] } {
  const rows = PILLBOX_PAGES.flatMap((page) => {
    const parsed: unknown = JSON.parse(gunzipSync(readFileSync(`${FIXTURE_DIR}${page}`)).toString("utf8"));
    if (!Array.isArray(parsed)) throw new PillSourceError(`${page} is not a list`);
    return parsed.filter(isRecord);
  });
  const records = rows.map((row) => pillboxRecord(row, images)).filter((record): record is PillRecord => record !== undefined);
  return { raw: rows.length, records };
}

function onlyIn(left: readonly string[], right: readonly string[]): readonly string[] {
  return left.filter((value) => !right.includes(value));
}

const images = pillboxImages();
const pillbox = readPillbox(images);
const dailymed = readDailyMed(process.argv[2] ?? DEFAULT_DAILYMED_ZIP);
const pillboxByProduct = newestPerProduct(pillbox.records);
const dailymedByProduct = newestPerProduct(dailymed.records);
const overlap = [...dailymedByProduct.keys()].filter((key) => pillboxByProduct.has(key)).length;
const merged = [
  ...dailymedByProduct.values(),
  ...[...pillboxByProduct.values()].filter((record) => !dailymedByProduct.has(productKey(record))),
].sort((left, right) => left.ndc.localeCompare(right.ndc) || left.part - right.part);

function latestDate(records: Iterable<PillRecord>): string {
  return [...records].reduce((latest, record) => (record.date > latest ? record.date : latest), "");
}

const pillboxDate = latestDate(pillboxByProduct.values());
const dailymedDate = latestDate(dailymedByProduct.values());
const sources: readonly PillSource[] = [
  {
    id: "dailymed",
    name: "DailyMed structured labels, monthly update for October 2026",
    url: DAILYMED_URL,
    snapshotDate: dailymedDate,
    records: merged.filter((record) => record.source === "dailymed").length,
  },
  {
    id: "pillbox",
    name: "NLM Pillbox archive, frozen in 2020",
    url: PILLBOX_URL,
    snapshotDate: pillboxDate,
    records: merged.filter((record) => record.source === "pillbox").length,
  },
];
const usedImages = new Set(merged.flatMap((record) => (record.pillboxImage === undefined ? [] : [record.pillboxImage])));
const file: PillFile = {
  sources,
  pillboxImageZip: { url: PILLBOX_IMAGE_ZIP_URL, entries: new Map([...images].filter(([name]) => usedImages.has(name))) },
  records: merged,
};
const json = `${JSON.stringify(encodePillFile(file))}\n`;
const checked = parsePillFile(JSON.parse(json));
if (checked.records.length !== merged.length) throw new PillSourceError("the written file does not read back to the same records");
if (Buffer.byteLength(json) > MAX_OUTPUT_BYTES) throw new PillSourceError(`the file is ${Buffer.byteLength(json)} bytes, over the limit`);
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(OUTPUT_PATH, json);

const pillboxRecords = [...pillboxByProduct.values()];
const dailymedRecords = [...dailymedByProduct.values()];
const withImprint = (records: readonly PillRecord[]) => records.filter((record) => normaliseImprint(record.imprint) !== "").length;
console.log(`Pillbox: ${pillbox.raw} rows, ${pillbox.records.length} with imprint or shape, ${pillboxRecords.length} distinct product NDC and part, records dated up to ${pillboxDate}.`);
console.log(`DailyMed: ${dailymed.labels} label zips, ${dailymed.records.length} product records, ${dailymedRecords.length} distinct product NDC and part, labels dated up to ${dailymedDate}.`);
console.log(`Overlap on product NDC and part: ${overlap}. DailyMed wins those.`);
console.log(`Merged: ${merged.length} records, ${withImprint(merged)} with an imprint.`);
console.log(
  `Pictures: ${merged.filter((record) => record.pillboxImage !== undefined).length} Pillbox photos, ${merged.filter((record) => record.splImage !== undefined).length} DailyMed SPLIMAGE names.`,
);
console.log(`Colours only in Pillbox: ${onlyIn(pillColors(pillboxRecords), pillColors(dailymedRecords)).join(", ") || "none"}.`);
console.log(`Colours only in DailyMed: ${onlyIn(pillColors(dailymedRecords), pillColors(pillboxRecords)).join(", ") || "none"}.`);
console.log(`Shapes only in Pillbox: ${onlyIn(pillShapes(pillboxRecords), pillShapes(dailymedRecords)).join(", ") || "none"}.`);
console.log(`Shapes only in DailyMed: ${onlyIn(pillShapes(dailymedRecords), pillShapes(pillboxRecords)).join(", ") || "none"}.`);
console.log(`Wrote ${OUTPUT_PATH}: ${Buffer.byteLength(json)} bytes.`);

import { MalformedResponseError } from "./errors.ts";
import { childRecord, isRecord, recordArrayField, stringField } from "./http.ts";
import type { JsonResponse } from "./http.ts";

const DAILYMED_SERVICE_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2";
const PACKAGE_WORDS = ["label", "carton", "bottle", "pdp", "package", "pkg", "box", "blister", "pouch", "front", "display"];
const DIAGRAM_WORD = /^(str|struct.*|chem.*|formula.*|fig.*|chart.*|graph.*|table.*|logo.*|equation.*)$/;
const STRENGTH_IN_NAME = /\d\s*(mg|mcg|ml|g)(?![a-z])/;
const DRUG_CODE_IN_NAME = /\d{4,5}-\d{3,4}/;
const OWN_CODE_SCORE = 4;
const PACKAGE_SCORE = 2;
const STRENGTH_SCORE = 1;
const DIAGRAM_SCORE = -3;

export interface LabelMedia {
  readonly name: string;
  readonly mimeType: string;
  readonly url: string;
}

export function mediaUrl(splSetId: string): string {
  return `${DAILYMED_SERVICE_URL}/spls/${encodeURIComponent(splSetId)}/media.json`;
}

export function toLabelMedia(response: JsonResponse): readonly LabelMedia[] {
  const data = isRecord(response.body) ? response.body["data"] : undefined;
  if (!isRecord(data)) throw new MalformedResponseError("dailymed", response.url, "there is no data block");
  return recordArrayField(childRecord(response.body, "data"), "media").flatMap((item) => {
    const url = stringField(item, "url");
    if (url === undefined) return [];
    return [{ url, name: stringField(item, "name") ?? "", mimeType: stringField(item, "mime_type") ?? "" }];
  });
}

export function packagePhotoScore(name: string, productNdc?: string): number {
  const lowered = name.toLowerCase();
  const words = lowered.split(/[^a-z]+/);
  return (
    (productNdc !== undefined && lowered.includes(productNdc) ? OWN_CODE_SCORE : 0) +
    (PACKAGE_WORDS.some((word) => lowered.includes(word)) || DRUG_CODE_IN_NAME.test(lowered) ? PACKAGE_SCORE : 0) +
    (STRENGTH_IN_NAME.test(lowered) ? STRENGTH_SCORE : 0) +
    (words.some((word) => DIAGRAM_WORD.test(word)) ? DIAGRAM_SCORE : 0)
  );
}

export function rankLabelImages(media: readonly LabelMedia[], productNdc?: string): readonly string[] {
  return media
    .filter((item) => item.mimeType.startsWith("image/"))
    .map((item, index) => ({ item, index, score: packagePhotoScore(item.name, productNdc) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ item }) => item.url);
}

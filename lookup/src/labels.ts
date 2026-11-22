import { mediaUrl, rankLabelImages, toLabelMedia } from "./dailymed.ts";
import { dsldPdfUrl } from "./dsld.ts";
import { labelByProductNdcUrl, labelBySetIdUrl, toLabelRecords } from "./openfda.ts";
import type { LabelRecord } from "./openfda.ts";
import type { Sources } from "./search.ts";
import type { IdentifiedProduct, LabelSections } from "./types.ts";

async function labelRecord(sources: Sources, product: IdentifiedProduct): Promise<LabelRecord | null> {
  if (product.productNdc !== undefined) {
    const [byCode] = toLabelRecords(await sources.openfda(labelByProductNdcUrl(product.productNdc)));
    if (byCode !== undefined) return byCode;
  }
  if (product.splSetId === undefined) return null;
  const [bySetId] = toLabelRecords(await sources.openfda(labelBySetIdUrl(product.splSetId)));
  return bySetId ?? null;
}

export async function getLabel(sources: Sources, product: IdentifiedProduct): Promise<LabelSections | null> {
  if (product.source !== "openfda") return null;
  return (await labelRecord(sources, product))?.sections ?? null;
}

export async function getLabelImages(sources: Sources, product: IdentifiedProduct): Promise<readonly string[]> {
  if (product.source === "dsld") return product.dsldId === undefined ? [] : [dsldPdfUrl(product.dsldId)];
  const setId = product.splSetId ?? (await labelRecord(sources, product))?.setId;
  if (setId === undefined) return [];
  return rankLabelImages(toLabelMedia(await sources.dailymed(mediaUrl(setId))), product.productNdc);
}

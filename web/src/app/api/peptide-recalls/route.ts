import type { NextRequest } from "next/server";
import { PEPTIDES, peptideNames, type PeptideId } from "@engine/peptides.ts";
import { findRecallsByText, NAME_MATCH_NOTICE, type RecallRecord } from "@engine/recalls.ts";
import type { PeptideRecallItem, PeptideRecallsResponse } from "@/components/PeptideRecalls";
import { loadRecalls } from "@/server/extras";

const MAX_SHOWN = 8;
const MAX_DESCRIPTION_LENGTH = 200;

function isPeptideId(id: string | null): id is PeptideId {
  return id !== null && Object.hasOwn(PEPTIDES, id);
}

function newestFirst(recalls: readonly RecallRecord[]): readonly RecallRecord[] {
  return [...recalls].sort(
    (left, right) => right.initiationDate.localeCompare(left.initiationDate) || right.reportDate.localeCompare(left.reportDate),
  );
}

function recallsNaming(names: readonly string[], recalls: readonly RecallRecord[]): readonly RecallRecord[] {
  const byNumber = new Map(
    names.flatMap((name) => findRecallsByText(name, recalls)).map((match) => [match.recall.recallNumber, match.recall] as const),
  );
  return newestFirst([...byNumber.values()]);
}

function toItem(recall: RecallRecord): PeptideRecallItem {
  return {
    recallNumber: recall.recallNumber,
    classification: recall.classification,
    status: recall.status,
    reason: recall.reason,
    productDescription: recall.productDescription.slice(0, MAX_DESCRIPTION_LENGTH).trimEnd(),
    recallingFirm: recall.recallingFirm,
    initiationDate: recall.initiationDate,
  };
}

export async function GET(request: NextRequest): Promise<Response> {
  const id = request.nextUrl.searchParams.get("id");
  if (!isPeptideId(id)) {
    return Response.json({ error: "That peptide is not on the list." }, { status: 400 });
  }
  try {
    const peptide = PEPTIDES[id];
    const file = await loadRecalls();
    const found = recallsNaming(peptideNames(peptide), file.recalls);
    const body: PeptideRecallsResponse = {
      peptide: peptide.name,
      total: found.length,
      shown: found.slice(0, MAX_SHOWN).map(toItem),
      notice: NAME_MATCH_NOTICE,
      file: { url: file.source.url, lastUpdated: file.source.lastUpdated, records: file.source.records },
    };
    return Response.json(body);
  } catch (error) {
    console.error("peptide recall lookup failed", error);
    return Response.json({ error: "The recall list could not load. Try again in a moment." }, { status: 500 });
  }
}

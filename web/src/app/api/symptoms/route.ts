import { isEmergency, matchSymptoms } from "@engine/symptoms.ts";
import { buildCabinet, flagsFor } from "@/server/cabinet";
import { failure } from "@/server/respond";
import { readItems, readProfile } from "@/server/validate";

const MAX_TEXT_LENGTH = 400;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { text?: unknown; items?: unknown; profile?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  const products = readItems(body?.items);
  if (text.length < 3 || products === null) {
    return Response.json({ error: "Say how you feel in a few words." }, { status: 400 });
  }
  if (isEmergency(text)) {
    return Response.json({ emergency: true, matches: [], flags: [] });
  }
  try {
    const cabinet = await buildCabinet(products);
    const matches = matchSymptoms(text, cabinet.items);
    const matchedIds = new Set(matches.map((match) => match.item.id));
    const flags = flagsFor(cabinet.items, readProfile(body?.profile)).filter((flag) =>
      flag.itemIds.some((id) => matchedIds.has(id)),
    );
    return Response.json({
      emergency: false,
      matches: matches.map((match) => ({ itemId: match.item.id, uses: match.quote.excerpt })),
      flags,
    });
  } catch (error) {
    return failure(error);
  }
}

import { isEmergency } from "@engine/symptoms.ts";
import { possibleCauses } from "@/server/causes";

const MAX_TEXT_LENGTH = 400;

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  if (text.length < 3) return Response.json({ error: "Say how you feel in a few words." }, { status: 400 });
  if (isEmergency(text)) return Response.json({ causes: [] });
  return Response.json(await possibleCauses(text));
}

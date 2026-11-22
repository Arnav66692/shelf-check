import { isEmergency } from "@engine/symptoms.ts";
import { MAX_SYMPTOM_TEXT_LENGTH, possibleCauses, TEXT_TOO_LONG } from "@/server/causes";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length > MAX_SYMPTOM_TEXT_LENGTH) return Response.json({ error: TEXT_TOO_LONG }, { status: 400 });
  if (text.length < 3) return Response.json({ error: "Say how you feel in a few words." }, { status: 400 });
  if (isEmergency(text)) return Response.json({ causes: [] });
  return Response.json(await possibleCauses(text));
}

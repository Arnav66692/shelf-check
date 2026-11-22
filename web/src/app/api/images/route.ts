import { getLabelImages } from "@lookup/index.ts";
import type { IdentifiedProduct } from "@lookup/types.ts";
import { failure } from "@/server/respond";

function isRecord(value: unknown): value is IdentifiedProduct {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<IdentifiedProduct>;
  return (candidate.source === "openfda" || candidate.source === "dsld") && typeof candidate.displayName === "string";
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { record?: unknown } | null;
  if (!body || !isRecord(body.record)) {
    return Response.json({ error: "No product record was sent." }, { status: 400 });
  }
  try {
    return Response.json({ images: await getLabelImages(body.record) });
  } catch (error) {
    return failure(error);
  }
}

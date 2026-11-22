import { buildCabinet, flagsFor } from "@/server/cabinet";
import { disposalAdvice } from "@engine/disposal.ts";
import { recallFlags, tagFlags } from "@/server/extras";
import { failure } from "@/server/respond";
import { allergiesOverLimit, readItems, readProfile } from "@/server/validate";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { items?: unknown; profile?: unknown } | null;
  const products = readItems(body?.items);
  if (products === null) return Response.json({ error: "The cabinet could not be read." }, { status: 400 });
  if (allergiesOverLimit(body?.profile)) {
    return Response.json({ error: "Up to 30 allergies can be checked. Remove some in About you and try again." }, { status: 400 });
  }
  try {
    const cabinet = await buildCabinet(products);
    const recalls = await recallFlags(cabinet.items);
    const flags = [...recalls.filter((flag) => flag.severity === "stop"), ...flagsFor(cabinet.items, readProfile(body?.profile))];
    const notes = [...tagFlags(cabinet.items), ...recalls.filter((flag) => flag.severity !== "stop")];
    const disposal = Object.fromEntries(cabinet.items.map((item) => [item.id, disposalAdvice(item).summary]));
    return Response.json({ flags: [...flags, ...notes], unchecked: cabinet.unchecked, disposal });
  } catch (error) {
    return failure(error);
  }
}

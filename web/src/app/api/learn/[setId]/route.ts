import { isSetId, lessonForSetId } from "@/server/learn/label";
import { failure } from "@/server/respond";

export async function GET(_request: Request, { params }: { params: Promise<{ setId: string }> }): Promise<Response> {
  const { setId } = await params;
  if (!isSetId(setId)) {
    return Response.json({ error: "That is not an FDA label code. Pick the medicine from your cabinet or search for it." }, { status: 400 });
  }
  try {
    const lesson = await lessonForSetId(setId);
    if (lesson === null) return Response.json({ error: "No FDA label was found for this code." }, { status: 404 });
    return Response.json(lesson);
  } catch (error) {
    return failure(error);
  }
}

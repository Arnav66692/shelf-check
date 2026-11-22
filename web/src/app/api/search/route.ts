import { findProducts } from "@/server/products";
import { failure } from "@/server/respond";

const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: `That is too long. Type the product name or the code from the label, up to ${MAX_QUERY_LENGTH} characters.` }, { status: 400 });
  }
  if ((query.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) {
    return Response.json({ error: "Type at least two letters or numbers of a name, or a code from the label." }, { status: 400 });
  }
  try {
    return Response.json(await findProducts(query));
  } catch (error) {
    return failure(error);
  }
}

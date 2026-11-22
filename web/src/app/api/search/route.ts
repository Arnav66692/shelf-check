import { findProducts } from "@/server/products";
import { failure } from "@/server/respond";

const MAX_QUERY_LENGTH = 120;

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: "Type at least two characters of a name, or a code from the label." }, { status: 400 });
  }
  try {
    return Response.json(await findProducts(query));
  } catch (error) {
    return failure(error);
  }
}

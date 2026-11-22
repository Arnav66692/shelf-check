import { LookupError, RateLimitError } from "@lookup/errors.ts";

export function failure(error: unknown): Response {
  if (error instanceof RateLimitError) {
    return Response.json(
      { error: "The official drug database has hit its request limit for now. Try again in a few minutes." },
      { status: 429 },
    );
  }
  if (error instanceof LookupError) {
    console.error("lookup failed", error);
    return Response.json({ error: "An official source did not answer. Try again in a moment." }, { status: 502 });
  }
  console.error("request failed", error);
  return Response.json({ error: "Something went wrong on our side. Try again." }, { status: 500 });
}

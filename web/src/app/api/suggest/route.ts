import { findProducts } from "@/server/products";
import { failure } from "@/server/respond";

const READER_URL = process.env.READER_URL ?? "http://127.0.0.1:8787";
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const READER_TIMEOUT_MS = 180_000;

type Agreement = { status: "verified" | "check" | "unreadable"; by: string; product_ndc: string | null };
type Reading = { code: string | null; name: string | null; lines: string[]; agreement?: Agreement };

async function readPhoto(photo: File): Promise<Reading | Response> {
  const form = new FormData();
  form.append("photo", photo);
  let response: Response;
  try {
    response = await fetch(`${READER_URL}/read`, { method: "POST", body: form, signal: AbortSignal.timeout(READER_TIMEOUT_MS) });
  } catch {
    return Response.json(
      { error: "The photo reader is not running here. Type the name or the code printed on the label." },
      { status: 503 },
    );
  }
  if (!response.ok) {
    const detail = ((await response.json().catch(() => null)) as { detail?: string } | null)?.detail;
    return Response.json({ error: detail ?? "The photo reader could not read that picture." }, { status: 502 });
  }
  return (await response.json()) as Reading;
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return Response.json({ error: "No photo was sent." }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return Response.json({ error: "That photo is larger than 12 MB. Take a closer, smaller picture." }, { status: 413 });
  }
  const reading = await readPhoto(photo);
  if (reading instanceof Response) return reading;
  try {
    const agreed = reading.agreement?.status === "verified" ? reading.agreement.product_ndc : null;
    const hinted = agreed ?? reading.agreement?.product_ndc ?? reading.code;
    const byCode = hinted ? await findProducts(hinted) : { products: [] };
    const found = byCode.products.length > 0 || !reading.name ? byCode : await findProducts(reading.name);
    const products = found.products.map((product) => ({
      ...product,
      matchedBy: "photo" as const,
      readerAgreement: agreed !== null && product.productNdc === agreed ? ("verified" as const) : ("check" as const),
    }));
    return Response.json({ read: { code: reading.code ?? undefined, name: reading.name ?? undefined, lines: reading.lines }, products });
  } catch (error) {
    return failure(error);
  }
}

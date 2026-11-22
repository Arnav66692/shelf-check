import type { Flag, Product, Profile } from "./model";

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok || body === null) {
    throw new ApiError(body?.error ?? `The lookup service did not answer (${response.status}). Try again in a moment.`);
  }
  return body as T;
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type SearchResult = { readonly products: readonly Product[]; readonly note?: string };

export function searchProducts(query: string): Promise<SearchResult> {
  return request<SearchResult>(`/api/search?q=${encodeURIComponent(query)}`);
}

export type CheckResult = {
  readonly flags: readonly Flag[];
  readonly unchecked: readonly string[];
  readonly disposal: Readonly<Record<string, string>>;
};

export function checkCabinet(items: readonly Product[], profile: Profile): Promise<CheckResult> {
  return postJson<CheckResult>("/api/check", { items, profile });
}

export type PhotoSuggestion = {
  readonly read: { readonly code?: string; readonly name?: string; readonly lines: readonly string[] };
  readonly products: readonly Product[];
};

export function suggestFromPhoto(file: File): Promise<PhotoSuggestion> {
  const form = new FormData();
  form.append("photo", file);
  return request<PhotoSuggestion>("/api/suggest", { method: "POST", body: form });
}

export type SymptomMatch = { readonly itemId: string; readonly uses: string };
export type PossibleCause = { readonly name: string; readonly why: string };
export type SymptomResult = {
  readonly emergency: boolean;
  readonly matches: readonly SymptomMatch[];
  readonly flags: readonly Flag[];
};
export type CausesResult = { readonly causes: readonly PossibleCause[]; readonly note?: string };

export function fetchPossibleCauses(text: string): Promise<CausesResult> {
  return postJson<CausesResult>("/api/causes", { text });
}

export function checkSymptoms(text: string, items: readonly Product[], profile: Profile): Promise<SymptomResult> {
  return postJson<SymptomResult>("/api/symptoms", { text, items, profile });
}

export function fetchLabelImages(product: Product): Promise<{ readonly images: readonly string[] }> {
  if (!product.record) return Promise.resolve({ images: [] });
  return postJson<{ readonly images: readonly string[] }>("/api/images", { record: product.record });
}

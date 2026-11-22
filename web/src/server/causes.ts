const MODEL_URL = process.env.CAUSES_MODEL_URL ?? "http://127.0.0.1:11434/api/chat";
const MODEL = process.env.CAUSES_MODEL ?? "qwen3-vl:8b";
const TIMEOUT_MS = 60_000;
const MAX_CAUSES = 5;
const MAX_ANSWER_TOKENS = 500;
// The local model spends its whole budget on hidden reasoning for text-only questions unless its answer is started for it.
const ANSWER_START = '{"causes":[';
const PROMPT =
  "A person describes how they feel. List up to 5 common possible causes a doctor might consider, most common first. " +
  "Do not name any medicine or dose. Do not tell them what to take. Keep each reason to one short plain sentence. " +
  'Reply with JSON only: {"causes":[{"name":string,"why":string}]}. The person says: ';

export type PossibleCause = { readonly name: string; readonly why: string };
export type CausesResult = { readonly causes: readonly PossibleCause[]; readonly note?: string };

function isCause(value: unknown): value is PossibleCause {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<PossibleCause>;
  return typeof candidate.name === "string" && typeof candidate.why === "string";
}

export async function possibleCauses(symptomText: string): Promise<CausesResult> {
  let response: Response;
  try {
    response = await fetch(MODEL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        options: { temperature: 0, num_ctx: 4096, num_predict: MAX_ANSWER_TOKENS },
        messages: [
          { role: "user", content: PROMPT + JSON.stringify(symptomText) },
          { role: "assistant", content: ANSWER_START },
        ],
      }),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return {
      causes: [],
      note: timedOut
        ? "The language model took too long to answer, so there is no list this time."
        : "The language model is not running here, so there is no list of possible causes.",
    };
  }
  if (!response.ok) return { causes: [], note: "The language model did not answer." };
  const payload = (await response.json().catch(() => null)) as { message?: { content?: string } } | null;
  try {
    const parsed = JSON.parse(ANSWER_START + (payload?.message?.content ?? "")) as { causes?: unknown };
    const causes = Array.isArray(parsed.causes) ? parsed.causes.filter(isCause).slice(0, MAX_CAUSES) : [];
    return causes.length > 0 ? { causes } : { causes: [], note: "The language model gave no usable list." };
  } catch {
    return { causes: [], note: "The language model gave no usable list." };
  }
}

import { openFdaApiKeyFromEnv } from "@lookup/index.ts";
import { createCachedJsonGetter, isRecord, STATUS_NOT_FOUND, STATUS_OK } from "@lookup/http.ts";
import { labelBySetIdUrl } from "@lookup/openfda.ts";
import { buildLesson } from "./lesson.ts";
import type { Lesson } from "./types.ts";

const SET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const apiKey = openFdaApiKeyFromEnv(process.env);
const getJson = createCachedJsonGetter({
  source: "openfda",
  fetch: (url, init) => fetch(url, init),
  acceptedStatuses: [STATUS_OK, STATUS_NOT_FOUND],
  ...(apiKey === undefined ? {} : { decorateUrl: (url: string) => `${url}&api_key=${encodeURIComponent(apiKey)}` }),
});

export function isSetId(value: string): boolean {
  return SET_ID.test(value);
}

export async function lessonForSetId(setId: string): Promise<Lesson | null> {
  if (!isSetId(setId)) return null;
  const { body } = await getJson(labelBySetIdUrl(setId.toLowerCase()));
  const results = isRecord(body) && Array.isArray(body["results"]) ? body["results"] : [];
  const label = results.find(isRecord);
  return label ? buildLesson(setId.toLowerCase(), label) : null;
}

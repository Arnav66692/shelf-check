import { recordingFetch, requestCounts } from "./recordingFetch.ts";

const PREVIEW_LENGTH = 3000;
const [url] = process.argv.slice(2);
if (url === undefined) throw new Error("Usage: node scripts/probe.ts <url>");
const response = await recordingFetch(url);
const text = await response.text();
console.log(response.status, text.length);
console.log(text.slice(0, PREVIEW_LENGTH));
console.log(JSON.stringify(requestCounts()));

export type ApiSource = "openfda" | "rxnav" | "dailymed" | "dsld";

const SOURCE_LABELS: Readonly<Record<ApiSource, string>> = {
  openfda: "openFDA",
  rxnav: "RxNav",
  dailymed: "DailyMed",
  dsld: "NIH DSLD",
};

const DETAIL_PREVIEW_LENGTH = 200;

export class LookupError extends Error {
  readonly source: ApiSource;
  readonly url: string;

  constructor(source: ApiSource, url: string, message: string) {
    super(message);
    this.name = "LookupError";
    this.source = source;
    this.url = url;
  }
}

export class NetworkError extends LookupError {
  constructor(source: ApiSource, url: string, cause: unknown) {
    super(source, url, `Could not reach ${SOURCE_LABELS[source]} (${String(cause)}). Check the connection and retry.`);
    this.name = "NetworkError";
  }
}

export class RateLimitError extends LookupError {
  constructor(source: ApiSource, url: string) {
    const fix = source === "openfda" ? "Wait, or set OPENFDA_API_KEY to raise the daily limit." : "Wait and retry.";
    super(source, url, `${SOURCE_LABELS[source]} rate limit reached (HTTP 429). ${fix}`);
    this.name = "RateLimitError";
  }
}

export class HttpStatusError extends LookupError {
  readonly status: number;

  constructor(source: ApiSource, url: string, status: number, body: string) {
    super(source, url, `${SOURCE_LABELS[source]} answered HTTP ${status}: ${body.slice(0, DETAIL_PREVIEW_LENGTH)}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export class MalformedResponseError extends LookupError {
  constructor(source: ApiSource, url: string, problem: string) {
    super(source, url, `${SOURCE_LABELS[source]} sent a response this library cannot read: ${problem}`);
    this.name = "MalformedResponseError";
  }
}

export class StrengthParseError extends Error {
  readonly text: string;

  constructor(text: string) {
    super(`Cannot parse strength "${text}". Expected a form such as "500 mg/1", "12.5 mg/5mL" or "137 ug/1".`);
    this.name = "StrengthParseError";
    this.text = text;
  }
}

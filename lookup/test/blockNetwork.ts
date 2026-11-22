import { vi } from "vitest";

vi.stubGlobal("fetch", (input: unknown) => {
  throw new Error(`Real network call attempted in a test: ${String(input)}`);
});

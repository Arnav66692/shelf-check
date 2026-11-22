import { vi } from "vitest";

vi.stubGlobal("fetch", (input: unknown) => {
  throw new Error(`Tests must run offline from fixtures, but something called fetch(${String(input)}).`);
});

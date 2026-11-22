import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NetworkError } from "../src/errors.ts";
import { createLookup } from "../src/lookup.ts";
import { createFixtureFetch } from "./fixtureFetch.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("aborts a stalled fetch and reads the saved product on the next attempt", async () => {
  const fixtures = createFixtureFetch();
  let firstSignal: AbortSignal | undefined;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (firstSignal) {
      const response = await fixtures.fetch(String(input));
      return new Response(await response.text(), { status: response.status });
    }
    firstSignal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  });
  try {
    const result = createLookup({ env: {} }).findByNdc("50580-590");
    await vi.advanceTimersByTimeAsync(11_999);
    expect(firstSignal?.aborted).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(401);
    expect(firstSignal?.aborted).toBe(true);
    await expect(result).resolves.toMatchObject({ status: "found", products: [{ productNdc: "50580-590" }] });
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    fetchSpy.mockRestore();
  }
});

test("bounds stalled body reads on all three attempts and evicts the failed request", async () => {
  const fixtures = createFixtureFetch();
  const signals: (AbortSignal | undefined)[] = [];
  const lookup = createLookup({
    env: {},
    fetch: (url, init) => {
      if (signals.length === 3) return fixtures.fetch(url);
      signals.push(init?.signal);
      return Promise.resolve({ status: 200, text: () => new Promise<string>(() => {}) });
    },
  });
  const failure = expect(lookup.findByNdc("50580-590")).rejects.toBeInstanceOf(NetworkError);
  await vi.runAllTimersAsync();
  await failure;
  expect(signals.map((signal) => signal?.aborted)).toEqual([true, true, true]);
  await expect(lookup.findByNdc("50580-590")).resolves.toMatchObject({
    status: "found", products: [{ productNdc: "50580-590" }],
  });
});

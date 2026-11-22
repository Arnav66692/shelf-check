import { describe, expect, test } from "vitest";
import { createRxNavClient, rxcuiUrl } from "../src/sources/rxnav.ts";
import { createFixtureFetch } from "./support/fixtures.ts";

describe("RxNav client", () => {
  test("turns a salt name into its base ingredient", async () => {
    const client = createRxNavClient({ fetch: createFixtureFetch() });

    const rxcui = await client.findRxcui("DIPHENHYDRAMINE HYDROCHLORIDE");
    const [base] = await client.getBaseIngredients(rxcui ?? "");

    expect(base?.name).toBe("diphenhydramine");
  });

  test("a name RxNorm files under two concepts always resolves to the lower-numbered one", async () => {
    const client = createRxNavClient({ fetch: createFixtureFetch() });
    const recorded = JSON.parse(await (await createFixtureFetch()(rxcuiUrl("Vitamin D3"))).text()) as {
      idGroup: { rxnormId: string[] };
    };

    expect(recorded.idGroup.rxnormId).toEqual(["1244014", "2418"]);
    expect(await client.findRxcui("Vitamin D3")).toBe("2418");
    expect(await client.findRxcui("CHOLECALCIFEROL")).toBe("2418");
  });

  test("lists ATC classes of the ingredient itself and leaves out combination products", async () => {
    const client = createRxNavClient({ fetch: createFixtureFetch() });

    const classes = await client.getClasses("1191", "ATC");

    expect(classes.map((drugClass) => drugClass.id)).toEqual(["A01AD", "B01AC", "N02BA"]);
  });

  test("lists the FDA established pharmacologic class of aspirin", async () => {
    const client = createRxNavClient({ fetch: createFixtureFetch() });

    const classes = await client.getClasses("1191", "FDASPL");

    expect(classes.map((drugClass) => drugClass.name)).toContain("Nonsteroidal Anti-inflammatory Drug");
  });

  test("lists ibuprofen among the members of ATC class M01A", async () => {
    const client = createRxNavClient({ fetch: createFixtureFetch() });

    const members = await client.getClassMembers("M01A", "ATC");

    expect(members.map((member) => member.name)).toContain("ibuprofen");
  });
});

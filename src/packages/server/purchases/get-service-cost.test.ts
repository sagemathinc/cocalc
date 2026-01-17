import getServiceCost from "./get-service-cost";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("get some service costs", () => {
  it("gets cost of a credit, i.e., the min allowed", async () => {
    // this depends on the default server settings, but it should be not too small
    // due to stripe cutoffs:
    expect(await getServiceCost("credit")).toBeGreaterThan(0.5);
  });

  it("throws error on invalid service", async () => {
    await expect(
      async () => await getServiceCost("nonsense" as any),
    ).rejects.toThrow();
  });
});

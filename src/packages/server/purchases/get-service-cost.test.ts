import getServiceCost from "./get-service-cost";
import { before, after } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("get some service costs", () => {
  it("get service cost of openai-gpt-3.5-turbo", async () => {
    const cost = await getServiceCost("openai-gpt-3.5-turbo");
    /*
    Cost looks something like
    {
      completion_tokens: 0.0000026,
      prompt_tokens: 0.00000195,
    }
    but it WILL changes over time as we change our rates and openai
    does as well, so we just test that the keys are there and the
    values are positive but relatively small.

    NOTE: This is the cost to us, but we don't actually charge users now for this.
    */
    expect(cost.completion_tokens).toBeGreaterThan(0);
    expect(cost.prompt_tokens).toBeGreaterThan(0);
    expect(cost.completion_tokens).toBeLessThan(0.0001);
    expect(cost.prompt_tokens).toBeLessThan(0.0001);
  });

  it("get service cost of openai-gpt-4", async () => {
    const cost = await getServiceCost("openai-gpt-4");
    expect(cost.completion_tokens).toBeGreaterThan(0);
    expect(cost.prompt_tokens).toBeGreaterThan(0);
    expect(cost.completion_tokens).toBeLessThan(0.0001);
    expect(cost.prompt_tokens).toBeLessThan(0.0001);
  });

  it("get service cost of openai-gpt-3.5-turbo-16k", async () => {
    const cost = await getServiceCost("openai-gpt-3.5-turbo-16k");
    expect(cost.completion_tokens).toBeGreaterThan(0);
    expect(cost.prompt_tokens).toBeGreaterThan(0);
    expect(cost.completion_tokens).toBeLessThan(0.0001);
    expect(cost.prompt_tokens).toBeLessThan(0.0001);
  });

  //   it("get service cost of text-embedding-ada-002", async () => {
  //     const cost = await getServiceCost("text-embedding-ada-002");
  //     console.log(cost);
  //     expect(cost.completion_tokens).toBeGreaterThan(0);
  //     expect(cost.prompt_tokens).toBeGreaterThan(0);
  //     expect(cost.completion_tokens).toBeLessThan(0.0001);
  //     expect(cost.prompt_tokens).toBeLessThan(0.0001);
  //   });

  it("gets cost of a credit, i.e., the min allowed", async () => {
    // this depends on the default server settings, but it should be not too small
    // due to stripe cutoffs:
    expect(await getServiceCost("credit")).toBeGreaterThan(0.5);
  });

  it("gets cost of a credit, i.e., the min allowed", async () => {
    // this depends on the default server settings.  It might look like
    // {"cores": 32, "disk_quota": 0.25, "member_host": 4, "memory": 4}
    // We test the four fields are there with positive values
    const cost = await getServiceCost("project-upgrade");
    expect(cost.cores).toBeGreaterThan(0);
    expect(cost.disk_quota).toBeGreaterThan(0);
    expect(cost.member_host).toBeGreaterThan(0);
    expect(cost.memory).toBeGreaterThan(0);
  });

  it("throws error on invalid service", async () => {
    await expect(
      async () => await getServiceCost("nonsense" as any),
    ).rejects.toThrow();
  });
});

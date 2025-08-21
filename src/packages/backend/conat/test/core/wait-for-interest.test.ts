/*
Conat can wait for interest before publishing a message, in case there is none
the first time it tries. There is thus only a penality on failure and never
on immediate success. We test that here.
*/

import { before, after, client, delay } from "../setup";

beforeAll(before);

describe("test waitForInterest when publishing", () => {
  it("publishes a message that gets dropped, illustrating that waitForInterest is NOT the default", async () => {
    const { count } = await client.publish("my.subject", null);
    expect(count).toBe(0);
  });

  it("publishes a message with waitForInterest, then creates a subscription (after publishing) and sees it work", async () => {
    const promise = client.publish(
      "my.subject",
      { co: "nat" },
      {
        waitForInterest: true,
      },
    );
    await delay(50);
    const sub = await client.subscribe("my.subject");
    const { count } = await promise;
    expect(count).toBe(1);
    const { value } = await sub.next();
    expect(value.data).toEqual({ co: "nat" });
  });
});

describe("test waitForInterest with request", () => {
  it("request throws an error by default if there is no listener", async () => {
    expect(async () => {
      await client.request("eval.server.com", "2+3");
    }).rejects.toThrow("no subscribers");
  });

  it("requests with waitForInterest set and sees it work", async () => {
    const promise = client.request("eval.server.com", "2+3", {
      waitForInterest: true,
    });
    await delay(50);
    const sub = await client.subscribe("eval.server.com");
    const { value } = await sub.next();
    await value.respond(eval(value.data));
    expect((await promise).data).toEqual(5);
  });
});

describe("test waitForInterest with requestMany", () => {
  it("request throws an error by default if there is no listener", async () => {
    expect(async () => {
      await client.requestMany("arith.server.com", [2, 3]);
    }).rejects.toThrow("no subscribers");
  });

  it("requestMany with waitForInterest set and sees it work", async () => {
    const promise = client.requestMany("arith.server.com", [2, 3], {
      waitForInterest: true,
    });
    await delay(50);
    const sub = await client.subscribe("arith.server.com");
    const { value } = await sub.next();
    await value.respond(value.data[0] + value.data[1]);
    await value.respond(value.data[0] * value.data[1]);

    const responseSub = await promise;
    const { value: sum } = await responseSub.next();
    expect(sum.data).toEqual(5);
    const { value: prod } = await responseSub.next();
    expect(prod.data).toEqual(6);
  });
});

afterAll(after);

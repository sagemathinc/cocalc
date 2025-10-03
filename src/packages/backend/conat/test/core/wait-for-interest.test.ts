/*
Conat can wait for interest before publishing a message, in case there is none
the first time it tries. There is thus only a penality on failure and never
on immediate success. We test that here.

pnpm test `pwd`/wait-for-interest.test.ts
*/

import { before, after, client, connect, delay } from "../setup";

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

describe("async respond tests for interest by default", () => {
  it("test making a requested and sending a response with two clients, which works fine", async () => {
    const server = await client.subscribe("eval2");

    const client2 = connect();
    const promise = client2.request("eval2", "2+3");

    const { value: mesg } = await server.next();
    await mesg.respond(eval(mesg.data));

    expect((await promise).data).toEqual(5);
    server.close();
  });

  it("same as previous, but we close the requesting client, causing respond to throw", async () => {
    const server = await client.subscribe("eval3");

    const client2 = connect();
    (async () => {
      try {
        await client2.request("eval3", "2+3", { timeout: 100 });
      } catch {}
    })();
    const { value: mesg } = await server.next();
    client2.close();
    try {
      await mesg.respond(eval(mesg.data), { timeout: 500 });
      throw Error("should time out");
    } catch (err) {
      // this is what should happen:
      expect(`${err}`).toContain("timed out");
    }
  });

  it("same as previous, but we use noThrow to get a silent fail (since we don't care)", async () => {
    const server = await client.subscribe("eval4");

    const client2 = connect();
    (async () => {
      try {
        await client2.request("eval4", "2+3", { timeout: 100 });
      } catch {}
    })();
    const { value: mesg } = await server.next();
    client2.close();
    await mesg.respond(eval(mesg.data), { timeout: 500, noThrow: true });
  });
  

});

afterAll(after);

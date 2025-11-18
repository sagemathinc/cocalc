/*
pnpm test ./services.test.ts
*/

import {
  before,
  after,
  connect,
  delay,
} from "@cocalc/backend/conat/test/setup";
import type { Client, Message } from "@cocalc/conat/core/client";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("test creating subscriptions", () => {
  let client1, client2;
  it("create two clients", async () => {
    client1 = connect({ reconnectionDelay: 250 });
    client2 = connect();
  });

  let sub;
  it("create a subscription in client1 and make sure it can be used from client2", async () => {
    sub = await client1.subscribe("foo");
    const { count } = await client2.publish("foo", "hello");
    expect(count).toBe(1);
    const { value } = await sub.next();
    expect(value.data).toBe("hello");
  });

  it("disconnects client1 and observes that client2 doesn't think client1 is listening anymore, rather than having requests 'hang until timeout'", async () => {
    client1.conn.io.engine.close();
    await wait({
      until: async () => {
        const { count } = await client2.publish("foo", "hello");
        return count == 0;
      },
    });
  });

  it("waits for client1 to connect again and observes that it *does* start receiving messages", async () => {
    await wait({
      until: async () => {
        const { count } = await client2.publish("foo", "hello");
        return count == 1;
      },
    });
  });

  it("cleans up", () => {
    sub.close();
    client1.close();
    client2.close();
  });
});

describe("more service tests", () => {
  let client1: Client, client2: Client;
  it("create two clients", async () => {
    client1 = connect({ reconnectionDelay: 1000 });
    client2 = connect();
  });

  let service, arith;
  it("create a *service* with typing, subject in client1 and use it from client2", async () => {
    interface Api {
      add: (a: number, b: number) => Promise<number>;
      mul: (a: number, b: number) => Promise<number>;
      getSubj: (a: number, b: number) => Promise<string>;
    }
    service = await client1.service<Api>("arith.*", {
      add: async (a, b) => a + b,
      mul: async (a, b) => a * b,
      // Here we do NOT use an arrow => function and this is
      // bound to the calling mesg, which lets us get the subject.
      // Because user identity and permissions are done via wildcard
      // subjects, having access to the calling message is critical
      async getSubj(a, b) {
        const mesg: Message = this as any;
        return `${mesg.subject}-${a}-${b}`;
      },
    });

    arith = client2.call<Api>("arith.one");
    expect(await arith.mul(2, 3)).toBe(6);
    expect(await arith.add(2, 3)).toBe(5);

    const arith2 = client2.call<Api>("arith.two");
    expect(await arith2.getSubj(2, 3)).toBe("arith.two-2-3");
  });

  it("tests disconnect", async () => {
    client1.conn.io.engine.close();
    await wait({
      until: async () => {
        const { count } = await client2.publish("arith.one", "hello");
        return count == 0;
      },
    });
    await expect(async () => {
      await arith.mul(2, 3);
    }).rejects.toThrow("no subscribers");
  });

  it("cleans up", () => {
    service.close();
    client1.close();
    client2.close();
  });
});

describe("illustrate using callMany to call multiple services and get all the results as an iterator", () => {
  let client1: Client, client2: Client, client3: Client;
  it("create three clients", async () => {
    client1 = connect();
    client2 = connect();
    client3 = connect();
  });

  let service1, service2;
  interface Api {
    who: () => Promise<number>;
  }
  it("create simple service on client1 and client2", async () => {
    service1 = await client1.service<Api>(
      "whoami",
      {
        who: async () => {
          return 1;
        },
      },
      { queue: "1" },
    );
    service2 = await client2.service<Api>(
      "whoami",
      {
        who: async () => {
          // make this one slow:
          await delay(250);
          return 2;
        },
      },
      { queue: "2" },
    );
  });

  it("call it without callMany -- this actually sends the request to *both* servers and returns the quicker one.", async () => {
    const call = client3.call<Api>("whoami");
    // quicker one is always 1:
    expect(await call.who()).toBe(1);
    expect(await call.who()).toBe(1);
    expect(await call.who()).toBe(1);
  });

  it("call the service using callMany and get TWO results in parallel", async () => {
    const callMany = client3.callMany("whoami", { maxWait: 1500 });
    const X: number[] = [];
    const start = Date.now();
    for await (const a of await callMany.who()) {
      X.push(a);
    }
    expect(X.length).toBe(2);
    expect(new Set(X)).toEqual(new Set([1, 2]));
    expect(Date.now() - start).toBeGreaterThan(1500);
  });

  it("call the service using callMany but limit results using mesgLimit instead of time", async () => {
    const callMany = client3.callMany("whoami", { maxMessages: 2 });
    const X: number[] = [];
    const start = Date.now();
    for await (const a of await callMany.who()) {
      X.push(a);
    }
    expect(X.length).toBe(2);
    expect(new Set(X)).toEqual(new Set([1, 2]));
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("cleans up", () => {
    service1.close();
    service2.close();
    client1.close();
    client2.close();
    client3.close();
  });
});

afterAll(after);

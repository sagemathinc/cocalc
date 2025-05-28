/*
pnpm test ./services.test.ts
*/

import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import { Client, type Message } from "@cocalc/conat/core/client";
import { delay } from "awaiting";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("test creating subscriptions with service property set", () => {
  let client1, client2;
  it("create two clients", async () => {
    client1 = connect({ reconnectionDelay: 50 });
    client2 = connect();
  });

  let sub;
  it("create an ephemeral subscription in client1 and make sure it can be used from client2", async () => {
    sub = await client1.subscribe("foo", { ephemeral: true });
    const { count } = await client2.publish("foo", "hello");
    expect(count).toBe(1);
    const { value } = await sub.next();
    expect(value.data).toBe("hello");
  });

  it("disconnects client1 and observes that client2 doesn't think client1 is listening anymore, rather than having requests 'hang forever'", async () => {
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

  let sub2;
  it("tries the same with services not set and observes that messages are queued", async () => {
    sub2 = await client1.subscribe("foo2", { ephemeral: false });
    client1.conn.io.engine.close();
    await delay(10);
    const { count } = await client2.publish("foo2", "hello");
    expect(count).toBe(1);
  });

  it("gets the message upon reconnect", async () => {
    const { value } = await sub2.next();
    expect(value.data).toBe("hello");
  });

  it("cleans up", () => {
    sub.close();
    sub2.close();
    client1.close();
    client2.close();
  });
});

describe("services with the ephemeral option", () => {
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
      subject: (a: number, b: number) => Promise<string>;
    }
    service = await client1.service<Api>("arith.*", {
      add: async (a, b) => a + b,
      mul: async (a, b) => a * b,
      // Here we do NOT use an arrow => function and this is
      // bound to the calling mesg, which lets us get the subject.
      // Because user identity and permissions are done via wildcard
      // subjects, having access to the calling message is critical
      async subject(a, b) {
        const mesg: Message = this as any;
        return `${mesg.subject}-${a}-${b}`;
      },
    });

    arith = client2.call<Api>("arith.one");
    expect(await arith.mul(2, 3)).toBe(6);
    expect(await arith.add(2, 3)).toBe(5);

    const arith2 = client2.call<Api>("arith.two");
    expect(await arith2.subject(2, 3)).toBe("arith.two-2-3");
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
    }).rejects.toThrowError("no subscribers");
  });

  it("cleans up", () => {
    service.close();
    client1.close();
    client2.close();
  });
});

afterAll(after);

/*

DEVELOPMENT:

pnpm test ./service.test.ts

*/

import { callConatService, createConatService } from "@cocalc/conat/service";
import {
  createServiceClient,
  createServiceHandler,
} from "@cocalc/conat/service/typed";
import { once } from "@cocalc/util/async-utils";
import { before, after, connect } from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";
import { is_date as isDate } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { initConatServer } from "@cocalc/backend/conat/test/setup";
import { getPort } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("create a service and test it out", () => {
  let s;
  let subject;
  it("creates a service", async () => {
    s = createConatService({
      service: "echo",
      handler: (mesg) => mesg.repeat(2),
    });
    subject = s.subject;
    await once(s, "running");
    expect(await callConatService({ service: "echo", mesg: "hello" })).toBe(
      "hellohello",
    );
  });

  it("closes the services and observes it doesn't work anymore", async () => {
    s.close();
    await expect(async () => {
      await callConatService({ service: "echo", mesg: "hi", timeout: 250 });
    }).rejects.toThrowError("timeout");
  });

  // [ ] TODO: broken!
  it.skip("creates a listener on the same subject and try to call to verify timeout works", async () => {
    const client = connect();
    const sub = await client.subscribe(subject);
    await expect(async () => {
      await callConatService({ service: "echo", mesg: "hi", timeout: 250 });
    }).rejects.toThrowError("timeout");
    sub.close();
  });
});

describe("verify that you can create a service AFTER calling it and things to still work fine", () => {
  let result = "";
  it("call a service that does not exist yet", () => {
    (async () => {
      result = await callConatService({ service: "echo3", mesg: "hello " });
    })();
  });

  it("create the echo3 service and observe that it answer the request we made before the service was created", async () => {
    const s = createConatService({
      service: "echo3",
      handler: (mesg) => mesg.repeat(3),
    });
    await wait({ until: () => result });
    expect(result).toBe("hello hello hello ");

    s.close();
  });
});

describe("create and test a more complicated service", () => {
  let client, service;
  it("defines the service", async () => {
    interface Api {
      add: (a: number, b: number) => Promise<number>;
      concat: (a: Buffer, b: Buffer) => Promise<Buffer>;
      now: () => Promise<Date>;
      big: (n: number) => Promise<string>;
      len: (s: string) => Promise<number>;
    }

    const name = "my-service";
    service = await createServiceHandler<Api>({
      service: name,
      subject: name,
      description: "My Service",
      impl: {
        // put any functions here that take/return MsgPack'able values
        add: async (a, b) => a + b,
        concat: async (a, b) => Buffer.concat([a, b]),
        now: async () => {
          await delay(5);
          return new Date();
        },
        big: async (n: number) => "x".repeat(n),
        len: async (s: string) => s.length,
      },
    });

    client = createServiceClient<Api>({
      service: name,
      subject: name,
    });
  });

  it("tests the service", async () => {
    // these calls are all type checked using typescript
    expect(await client.add(2, 3)).toBe(5);

    const a = Buffer.from("hello");
    const b = Buffer.from(" conat");
    expect(await client.concat(a, b)).toEqual(Buffer.concat([a, b]));

    const d = await client.now();
    expect(isDate(d)).toBe(true);
    expect(Math.abs(d.valueOf() - Date.now())).toBeLessThan(100);

    const n = 10 * 1e6;
    expect((await client.big(n)).length).toBe(n);

    expect(await client.len("x".repeat(n))).toBe(n);
  });

  it("cleans up", () => {
    service.close();
  });
});

describe("create a service with specified client, stop and start the server, and see service still works", () => {
  let server;
  let client;
  let client2;
  let port;
  it("create a conat server and client", async () => {
    port = await getPort();
    server = await initConatServer({ port });
    client = server.client({ reconnectionDelay: 50 });
    client2 = server.client({ reconnectionDelay: 50 });
  });

  let service;
  it("create a service using specific client and call it using both clients", async () => {
    service = createConatService({
      client,
      service: "double",
      handler: (mesg) => mesg.repeat(2),
    });

    expect(
      await callConatService({ client, service: "double", mesg: "hello" }),
    ).toBe("hellohello");

    expect(
      await callConatService({
        client: client2,
        service: "double",
        mesg: "hello",
      }),
    ).toBe("hellohello");
  });

  it("disconnect client and check service still works on reconnect", async () => {
    // cause a disconnect -- client will connect again in 50ms soon
    // and handle the request below:
    client.conn.io.engine.close();
    expect(
      await callConatService({
        client: client2,
        service: "double",
        mesg: "hello",
      }),
    ).toBe("hellohello");
  });

  it("disconnect client2 and check service still works on reconnect", async () => {
    // cause a disconnect -- client will connect again in 50ms soon
    // and handle the request below:
    client2.conn.io.engine.close();
    expect(
      await callConatService({
        client: client2,
        service: "double",
        mesg: "hello",
      }),
    ).toBe("hellohello");
  });

  it("disconnect both clients and check service still works on reconnect", async () => {
    // cause a disconnect -- client will connect again in 50ms soon
    // and handle the request below:
    client.conn.io.engine.close();
    client2.conn.io.engine.close();
    expect(
      await callConatService({
        client: client2,
        service: "double",
        mesg: "hello",
      }),
    ).toBe("hellohello");
  });

  it("kills the server, then makes another one serving on the same port", async () => {
    await server.close();
    server = await initConatServer({ port });
    // Killing the server is not at all a normal thing to expect, and causes loss of
    // its state.  The clients have to sync realize subscriptions are missing.  This
    // takes a fraction of a second and the call below won't immediately work without
    // a short delay, unfortunately.  TODO: should we handle this better?
    await delay(100);
    expect(
      await callConatService({
        client: client2,
        service: "double",
        mesg: "hello",
        noRetry: true,
      }),
    ).toBe("hellohello");
  });

  it("cleans up", () => {
    service.close();
    client.close();
    client2.close();
    server.close();
  });
});

afterAll(after);

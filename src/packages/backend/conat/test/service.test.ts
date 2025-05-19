/*

DEVELOPMENT:

pnpm test ./service.test.ts

*/

import { callNatsService, createNatsService } from "@cocalc/conat/service";
import { once } from "@cocalc/util/async-utils";
import { before, after } from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("create a service and test it out", () => {
  let s;
  it("creates a service", async () => {
    s = createNatsService({
      service: "echo",
      handler: (mesg) => mesg.repeat(2),
    });
    await once(s, "running");
    expect(await callNatsService({ service: "echo", mesg: "hello" })).toBe(
      "hellohello",
    );
  });

  it("closes the services and observes it doesn't work anymore", async () => {
    s.close();

    let t = "";
    await expect(async () => {
      await callNatsService({ service: "echo", mesg: "hi", timeout: 1000 });
    }).rejects.toThrowError("timeout");
  });
});

describe("verify that you can create a service AFTER calling it and things to still work fine", () => {
  let result = "";
  it("call a service that does not exist yet", () => {
    (async () => {
      result = await callNatsService({ service: "echo3", mesg: "hello " });
    })();
  });

  it("create the echo3 service and observe that it answer the request we made before the service was created", async () => {
    const s = createNatsService({
      service: "echo3",
      handler: (mesg) => mesg.repeat(3),
    });
    await wait({ until: () => result });
    expect(result).toBe("hello hello hello ");

    s.close();
  });
});

afterAll(after);

/*

DEVELOPMENT:

pnpm test --forceExit service.test.ts

*/

import { callNatsService, createNatsService } from "@cocalc/nats/service";
import { once } from "@cocalc/util/async-utils";
import "@cocalc/backend/nats";

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

  it("closes the services", async () => {
    s.close();

    let t = "";
    // expect( ...).toThrow doesn't seem to work with this:
    try {
      await callNatsService({ service: "echo", mesg: "hi" });
    } catch (err) {
      t = `${err}`;
    }
    expect(t).toContain("Not Available");
  });
});

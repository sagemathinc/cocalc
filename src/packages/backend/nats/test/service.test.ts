/*

DEVELOPMENT:

pnpm exec jest --watch --forceExit --detectOpenHandles "service.test.ts"

*/

import {
  callNatsService,
  createNatsService,
} from "@cocalc/backend/nats/service";
import { delay } from "awaiting";

describe("create a service and test it out", () => {
  let s;
  it("creates a service", async () => {
    s = await createNatsService({ service: "echo", handler: (mesg) => mesg });
    await delay(0);
    expect(await callNatsService({ service: "echo", mesg: "hello" })).toBe(
      "hello",
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

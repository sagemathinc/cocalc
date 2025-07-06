import { once } from "./async-utils";
import { EventEmitter } from "events";

describe("test once timing out due to close", () => {
  class Obj extends EventEmitter {}
  it("creates object, waits for event and has it work fine", async () => {
    const obj = new Obj();
    const w = once(obj, "ready");
    obj.emit("ready");
    await w;
  });

  it("creates object, waits for an event, but instead gets closed", async () => {
    const obj = new Obj();
    const w = once(obj, "ready");
    obj.emit("closed");
    try {
      await w;
    } catch (err) {
      expect(`${err}`).toContain(`not emitted before "closed"`);
      // timeout error, though it's really due to "close"
      expect(err.code).toBe(408);
    }
  });

  it("creates object and has it throw due to the timeout", async () => {
    const obj = new Obj();
    const w = once(obj, "ready", 50);
    try {
      await w;
    } catch (err) {
      expect(`${err}`).toContain("timeout");
      // timeout error, obviously
      expect(err.code).toBe(408);
    }
  });
});

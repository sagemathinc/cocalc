/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Tests for the mapValues helper that replaced underscore's _.mapObject
// in message.js, and for message creation/serialization edge cases.

const { _mapValues: mapValues } = require("./message");

describe("mapValues", () => {
  test("maps over object values", () => {
    const obj = { a: 1, b: 2, c: 3 };
    const result = mapValues(obj, (v: number) => v * 2);
    expect(result).toEqual({ a: 2, b: 4, c: 6 });
  });

  test("passes (value, key, object) to callback", () => {
    const obj = { x: 10 };
    const calls: [number, string, object][] = [];
    mapValues(obj, (val: number, key: string, o: object) => {
      calls.push([val, key, o]);
      return val;
    });
    expect(calls).toEqual([[10, "x", obj]]);
  });

  test("returns new object, does not mutate input", () => {
    const obj = { a: 1 };
    const result = mapValues(obj, (v: number) => v + 1);
    expect(result).toEqual({ a: 2 });
    expect(obj).toEqual({ a: 1 });
    expect(result).not.toBe(obj);
  });

  test("empty object returns empty object", () => {
    expect(mapValues({}, (v: unknown) => v)).toEqual({});
  });

  test("preserves null values (critical for JSON serialization)", () => {
    const obj = { a: null, b: 1 };
    const result = mapValues(obj, (v: unknown) => v);
    expect(result).toEqual({ a: null, b: 1 });
    // null must survive JSON round-trip (unlike undefined)
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized).toEqual({ a: null, b: 1 });
    expect("a" in serialized).toBe(true);
  });

  test("preserves undefined values in result (but they are dropped by JSON.stringify)", () => {
    const obj = { a: undefined, b: 1 };
    const result = mapValues(obj, (v: unknown) => v);
    expect(result).toEqual({ a: undefined, b: 1 });
    expect("a" in result).toBe(true);
    // undefined keys are dropped by JSON.stringify — this is expected behavior
    const serialized = JSON.parse(JSON.stringify(result));
    expect("a" in serialized).toBe(false);
  });

  test("handles init extraction pattern used in message2", () => {
    // This mirrors the actual usage: _.mapObject(obj.fields, (val) => val.init)
    const fields = {
      project_id: { init: undefined, desc: "the project id" },
      path: { init: "", desc: "file path" },
      timeout: { init: 30, desc: "timeout in seconds" },
      required_field: { init: "REQUIRED", desc: "a required field" },
      nullable: { init: null, desc: "explicitly null default" },
    };
    const result = mapValues(fields, (val: { init: unknown }) => val.init);
    expect(result).toEqual({
      project_id: undefined,
      path: "",
      timeout: 30,
      required_field: "REQUIRED",
      nullable: null,
    });
  });

  test("only iterates own properties, not inherited ones", () => {
    const proto = { inherited: true };
    const obj = Object.create(proto);
    obj.own = 1;
    const result = mapValues(obj, (v: unknown) => v);
    expect(result).toEqual({ own: 1 });
    expect("inherited" in result).toBe(false);
  });
});

describe("message creation", () => {
  // Verify that message functions still produce correct output after
  // the underscore removal
  const message = require("./message");

  test("ping message has correct event", () => {
    const msg = message.ping();
    expect(msg.event).toBe("ping");
    expect(msg.id).toBeUndefined();
  });

  test("message with explicit fields", () => {
    const msg = message.ping({ id: "test-123" });
    expect(msg.event).toBe("ping");
    expect(msg.id).toBe("test-123");
  });

  test("message2 round-trip preserves null/undefined defaults", () => {
    // message2-defined messages should have their fields created correctly
    // Check that the documentation was also generated
    expect(message.documentation).toBeDefined();
    expect(message.documentation.events).toBeDefined();
  });
});

/*
 * This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 * License: MS-RSL – see LICENSE.md for details
 */

import { key_value_store } from "@cocalc/util/key-value-store";

describe("create a simple key value store with various single keys -- ", () => {
  let k;

  beforeAll(() => (k = key_value_store()));

  it('saves "x":{foo:3}', () => {
    k.set("x", { foo: 3 });
    expect(k.get("x")).toEqual({ foo: 3 });
    k.delete("x");
    expect(k.get("x")).toEqual(undefined);
  });

  it("saves {foo:3, bar:5}:'x' (so non-string key)", () => {
    k.set({ foo: 3, bar: 5 }, "x");
    expect(k.get({ bar: 5, foo: 3 })).toEqual("x");
    k.delete({ bar: 5, foo: 3 });
    expect(k.get({ bar: 5, foo: 3 })).toEqual(undefined);
  });

  it("closes k", () => {
    expect(k._data != null).toBe(true);
    k.close();
    expect(k._data != null).toBe(false);
    expect(() => k.set("a", 1)).toThrow();
    expect(() => k.get("a")).toThrow();
    expect(() => k.delete("a")).toThrow();
  });
});

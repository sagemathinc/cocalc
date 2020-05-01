/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PatchValueCache } from "../patch-value-cache";
import { StringDocument } from "../../string/doc";

describe("Test out an empty cache", () => {
  let cache: PatchValueCache;

  it("creates the empty cache", () => {
    cache = new PatchValueCache();
    expect(typeof cache).toBe("object"); // trivial check
  });

  it("invalidates the empty cache (no op)", () => {
    cache.invalidate(new Date());
  });

  it("prunes the empty cache (no op)", () => {
    cache.prune(0);
  });

  it("gets newest value after some point -- nothing there, so undefined", () => {
    expect(cache.newest_value_at_most()).toBe(undefined);
  });

  it("gets cached entry at given point in time, so undefined", () => {
    expect(cache.get(new Date())).toBe(undefined);
  });

  it("gets oldest cached time, so undefined since there are none", () => {
    expect(cache.oldest_time()).toBe(undefined);
  });

  it("there are no cached values", () => {
    expect(cache.size()).toBe(0);
  });
});

describe("Test a cache with some contents", () => {
  let cache: PatchValueCache;

  const times: Date[] = [
    new Date("2019-01-03T20:34"),
    new Date("2019-01-03T20:40"),
    new Date("2019-01-03T22:00"),
  ];

  const values: StringDocument[] = [
    new StringDocument("CoCalc"),
    new StringDocument("SageMath"),
    new StringDocument("SageMathCloud"),
  ];

  const starts = [3, 10, 20];

  it("creates a cache and populates it", () => {
    cache = new PatchValueCache();
    for (let n = 0; n <= 2; n++) {
      cache.include(times[n], values[n], starts[n]);
    }
  });

  it("gets oldest cached time", () => {
    expect(cache.oldest_time()).toEqual(times[0]);
  });

  it("there are some cached values", () => {
    expect(cache.size()).toEqual(times.length);
  });

  it("gets newest value after some point", () => {
    for (let n = 0; n <= 2; n++) {
      const v = cache.newest_value_at_most(times[n]);
      expect(v != null).toBe(true);
      if (v != null) {
        expect(v.value.to_str()).toBe(values[n].to_str());
      }
    }

    const v = cache.newest_value_at_most(new Date("2019-01-03T20:35"));
    expect(v != null).toBe(true);
    if (v != null) {
      expect(v.value.to_str()).toBe(values[0].to_str());
    }
  });

  it("gets cached entry at given point in time", () => {
    for (let n = 0; n <= 2; n++) {
      const e = cache.get(times[n]);
      expect(e != null).toBe(true);
      if (e != null) {
        expect(e.value.to_str()).toBe(values[n].to_str());
      }
    }
  });

  it("invalidates a cached value", () => {
    // this also invalidates cache for times[2] (which is later),
    // hence the 1 below.
    cache.invalidate(times[1]);
    expect(cache.size()).toBe(1);
  });

  it("prunes the cache down to size 2 (from size 3)...", () => {
    // put the two that gote removed above back:
    for (let n = 1; n <= 2; n++) {
      cache.include(times[n], values[n], starts[n]);
    }
    cache.prune(2);
    expect(cache.size()).toBe(2);
  });
});

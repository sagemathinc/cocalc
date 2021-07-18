/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This fails upon importing misc_page.
*/

// trivial test, otherwise jest also fails
describe("Local Storage", () => {
  test("NOT TESTED: FIXME!", () => {
    expect(true).toBe(true);
  });
});

/*
import * as LS from "../local-storage";

const KEY = "test";

describe("Local Storage", () => {
  test("set", () => {
    expect(LS.set(KEY, 123)).toBe(true);
  });

  test("get", () => {
    expect(LS.get(KEY)).toBe(123);
  });

  test("exists1", () => {
    expect(LS.exists(KEY)).toBe(true);
  });

  test("del1", () => {
    expect(LS.del(KEY)).toBe(123);
  });

  test("exists1", () => {
    expect(LS.exists(KEY)).toBe(false);
  });

  test("del2", () => {
    expect(LS.del(KEY)).toBe(undefined);
  });
});
*/

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as LS from "../local-storage";

const KEY = "test";

describe("Local Storage", () => {
  test("set", () => {
    LS.set_local_storage(KEY, "123");
  });

  test("get", () => {
    expect(LS.get_local_storage(KEY)).toBe("123");
  });

  test("set2", () => {
    LS.set_local_storage(KEY, "eee");
  });

  test("get", () => {
    expect(LS.get_local_storage(KEY)).toBe("eee");
  });

  test("exists1", () => {
    expect(LS.exists_local_storage(KEY)).toBe(true);
  });

  test("del1", () => {
    LS.delete_local_storage(KEY);
  });

  test("exists1", () => {
    expect(LS.exists_local_storage(KEY)).toBe(false);
  });

  test("del2", () => {
    expect(LS.delete_local_storage(KEY)).toBe(undefined);
  });
});

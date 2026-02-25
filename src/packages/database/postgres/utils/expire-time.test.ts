/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { expire_time } from "@cocalc/database";

describe("expire_time", () => {
  it("returns a future date when ttl is provided", () => {
    const before = Date.now();
    const value = expire_time(10);
    const after = Date.now();

    expect(value).toBeInstanceOf(Date);
    const dateValue = value as Date;
    expect(dateValue.getTime()).toBeGreaterThanOrEqual(before + 10000);
    expect(dateValue.getTime()).toBeLessThanOrEqual(after + 10000);
  });

  it("returns undefined when ttl is falsy", () => {
    expect(expire_time(0)).toBeUndefined();
    expect(expire_time(undefined as unknown as number)).toBeUndefined();
  });
});

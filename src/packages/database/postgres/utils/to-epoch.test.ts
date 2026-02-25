/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { toEpoch } from "./to-epoch";

describe("toEpoch", () => {
  it("converts specified fields on a single object", () => {
    const date = new Date("2020-01-01T00:00:00Z");
    const row: Record<string, unknown> = {
      created: date.toISOString(),
      untouched: 5,
    };

    toEpoch(row, ["created"]);

    expect(row.created).toBe(date.valueOf());
    expect(row.untouched).toBe(5);
  });

  it("converts fields across multiple rows", () => {
    const date = new Date("2021-02-03T04:05:06Z");
    const rows: Array<Record<string, unknown>> = [
      { created: date, other: "ok" },
      { created: null, other: "skip" },
    ];

    toEpoch(rows, ["created"]);

    expect(rows[0].created).toBe(date.valueOf());
    expect(rows[1].created).toBeNull();
  });
});

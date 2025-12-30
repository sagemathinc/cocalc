/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { pg_type } from "@cocalc/database";

describe("pg_type", () => {
  it("returns pg_type field when provided", () => {
    expect(pg_type({ pg_type: "fubar" })).toBe("fubar");
  });

  it("throws when insufficient information is provided", () => {
    expect(() => pg_type({} as unknown as { pg_type?: string })).toThrow(
      /pg_type: insufficient information/i,
    );
  });
});

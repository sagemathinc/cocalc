/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { quote_field } from "@cocalc/database";

describe("quote_field", () => {
  it("wraps fields in quotes", () => {
    expect(quote_field("name")).toBe('"name"');
  });

  it("returns already-quoted fields unchanged", () => {
    expect(quote_field('"name"')).toBe('"name"');
  });
});

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { UntrustedJavascript } from "../untrusted-javascript";

describe("basic test", () => {
  it("checks the output", () => {
    render(<UntrustedJavascript />);
    expect(
      screen.getByText(/not running untrusted Javascript/i)
    ).toBeInTheDocument();
  });
});
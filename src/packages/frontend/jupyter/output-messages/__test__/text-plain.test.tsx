/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { TextPlain } from "../text-plain";

describe("basic hello world", () => {
  it("checks the output", () => {
    render(<TextPlain value="Hello World" />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("changes the value and checks new output", () => {
    const { rerender } = render(<TextPlain value="Hello World" />);
    rerender(<TextPlain value="xyz" />);
    expect(screen.getByText("xyz")).toBeInTheDocument();
  });
});
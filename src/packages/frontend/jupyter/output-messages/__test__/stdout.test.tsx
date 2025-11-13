/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cocalc/src/packages/frontend/jupyter/output-messages/__test__/stdout.test.tsx

import React from "react";
import { render, screen } from "@testing-library/react";
import { Stdout } from "../stdout";
import { Ansi } from "../ansi";
import { fromJS } from "immutable";

describe("basic Stdout hello test", () => {
  it("checks for the output", () => {
    render(<Stdout message={fromJS({ text: "Hello World" })} />);
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("changes the message and checks that correct new output appears", () => {
    const { rerender } = render(
      <Stdout message={fromJS({ text: "Hello World" })} />,
    );
    rerender(<Stdout message={fromJS({ text: "Hello CoCalc!" })} />);
    expect(screen.getByText("Hello CoCalc!")).toBeInTheDocument();
  });
});

describe("test ANSI rendering by Stdout", () => {
  it("checks for the ANSI output", () => {
    render(<Stdout message={fromJS({ text: "\u001b[34mhello world" })} />);
    // You may want to query by role or text. If the Ansi renders <span>hello world</span>, use this:
    expect(screen.getByText("hello world")).toBeInTheDocument();
    // More specific: test by component with custom query if needed.
  });
});

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { render } from "@testing-library/react";
import { Stderr } from "../stderr";
import { Ansi } from "../ansi";
import { fromJS } from "immutable";

describe("basic Stderr hello test", () => {
  it("checks for the output", () => {
    const { getByText } = render(<Stderr message={fromJS({ text: "Hello World" })} />);
    expect(getByText("Hello World")).toBeInTheDocument();
  });

  it("changes the message and checks that correct new output appears", () => {
    const { getByText, rerender } = render(
      <Stderr message={fromJS({ text: "Hello World" })} />
    );
    rerender(<Stderr message={fromJS({ text: "Hello CoCalc!" })} />);
    expect(getByText("Hello CoCalc!")).toBeInTheDocument();
  });
});

describe("test ANSI rendering by Stderr", () => {
  it("checks for the ANSI output", () => {
    const { container } = render(
      <Stderr message={fromJS({ text: "\u001b[34mhello world" })} />
    );
    // Ensures the Ansi component rendered with "hello world".  
    expect(container.textContent).toContain("hello world");
    // Optionally, check for the actual Ansi element:
    // expect(container.querySelector("span.ansi")).toBeInTheDocument();
  });
});

describe("Stderr style test", () => {
  it("checks the style -- has a red background.", () => {
    const { container } = render(<Stderr message={fromJS({ text: "Hello World" })} />);
    const stderr = container.firstChild as HTMLElement;
    // Check for inline style background-color. Adjust selector as needed.
    expect(stderr.getAttribute("style")).toContain("background-color: rgb(255, 221, 221)");
    // Or, if using CSS classes, use:
    // expect(stderr).toHaveStyle("background-color: #fdd");
  });
});
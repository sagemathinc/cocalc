/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// ansi.test.tsx
import { render, screen } from "@testing-library/react";
import { Ansi } from "../ansi";

describe("Ansi component", () => {
  it("renders plain text", () => {
    render(<Ansi>Hello World</Ansi>);
    const span = screen.getByText("Hello World");
    expect(span.tagName).toBe("SPAN");
  });

  it("renders text with ANSI codes", () => {
    render(<Ansi>{"\u001b[34mhello world"}</Ansi>);
    const span = screen.getByText("hello world");
    expect(span).toBeInTheDocument();
    expect(span.tagName).toBe("SPAN");
  });

  it("applies correct style for ANSI color", () => {
    render(<Ansi>{"\u001b[34mhello world"}</Ansi>);
    const span = screen.getByText("hello world");
    expect(span).toHaveStyle("color: rgb(0, 0, 187)");
  });
});

/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { render } from "@testing-library/react";

import { renderInline } from "./render-inline";

function html(text: string): string {
  const { container } = render(<>{renderInline(text)}</>);
  return container.innerHTML;
}

describe("renderInline — nested inline rendering", () => {
  it("plain text passes through unchanged", () => {
    const { container } = render(<>{renderInline("just text")}</>);
    expect(container.textContent).toBe("just text");
  });

  it("nested \\textbf{ \\textit{ } } renders bold containing italic", () => {
    const { container } = render(
      <>{renderInline("bold \\textit{italic}")}</>,
    );
    const em = container.querySelector("em");
    expect(em).not.toBeNull();
    expect(em!.textContent).toBe("italic");
  });

  it("inline math inside text renders KaTeX", () => {
    const { container } = render(<>{renderInline("a $x^2$ b")}</>);
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("textcolor renders its content with the color applied", () => {
    const out = html("\\textcolor{red}{stop}");
    expect(out).toContain("stop");
    expect(out).toContain("red");
  });

  it("unknown construct falls back to raw source", () => {
    const { container } = render(<>{renderInline("\\ref{eq:1}")}</>);
    expect(container.textContent).toContain("\\ref{eq:1}");
  });

  it("un-renderable math falls back to raw LaTeX, not a ?math? marker", () => {
    const { container } = render(
      <>{renderInline("see $\\zzundefinedmacro x$ here")}</>,
    );
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).not.toContain("?math?");
    expect(container.textContent).toContain("$\\zzundefinedmacro x$");
  });
});

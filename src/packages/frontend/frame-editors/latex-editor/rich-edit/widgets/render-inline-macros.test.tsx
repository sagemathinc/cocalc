/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Verifies the per-document macro map reaches inline math nested inside
// text-style widgets (the codex follow-up: \textbf{$x \in \R$}). The
// macros travel via MathMacrosContext, so this mocks mathToHtml and
// asserts it receives the context's macro map as its 3rd argument.

import { render } from "@testing-library/react";

import mathToHtml from "@cocalc/frontend/misc/math-to-html";

import { MathMacrosContext } from "../math-macros-context";
import { renderInline } from "./render-inline";

jest.mock("@cocalc/frontend/misc/math-to-html", () => ({
  __esModule: true,
  default: jest.fn(() => ({ __html: "<span class=\"katex\">ok</span>" })),
}));

const mockMath = mathToHtml as unknown as jest.Mock;

describe("nested inline math receives document macros via context", () => {
  beforeEach(() => mockMath.mockClear());

  it("passes the context macro map to mathToHtml", () => {
    const macros = { "\\R": "\\mathbb{R}" };
    render(
      <MathMacrosContext.Provider value={macros}>
        {renderInline("bold $x \\in \\R$")}
      </MathMacrosContext.Provider>,
    );
    const call = mockMath.mock.calls.find((c) => String(c[0]).includes("\\R"));
    expect(call).toBeDefined();
    expect(call![2]).toBe(macros);
  });

  it("passes undefined when no macros are in context", () => {
    render(<>{renderInline("plain $y$ here")}</>);
    const call = mockMath.mock.calls.find((c) => String(c[0]).includes("y"));
    expect(call).toBeDefined();
    expect(call![2]).toBeUndefined();
  });
});

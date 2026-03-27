/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { normalizeAssistantSeed } from "./assistant-seed";
import { createMessage } from "./help-me-fix-utils";

describe("help-me-fix assistant routing helpers", () => {
  test("createMessage includes additional context before the full input", () => {
    const message = createMessage({
      error: "Undefined control sequence",
      line: "\\badcommand",
      input: "\\section{Test}",
      task: "ran latex",
      language: "latex",
      extraFileInfo: "LaTeX",
      extraContext:
        "Build stage: latex\n\nRecent stderr tail:\n```text\nerror\n```",
      model: "gpt-5.4-mini",
      prioritize: "start-end",
      open: false,
      full: false,
    });

    expect(message).toContain("Additional context:");
    expect(message).toContain("Build stage: latex");
    expect(message.indexOf("Additional context:")).toBeLessThan(
      message.indexOf("My LaTeX contains:"),
    );
  });

  test("normalizeAssistantSeed accepts plain objects and immutable-like values", () => {
    expect(
      normalizeAssistantSeed({ id: "abc", prompt: "Help me fix this" }),
    ).toEqual({
      id: "abc",
      prompt: "Help me fix this",
      forceNewTurn: undefined,
    });

    expect(
      normalizeAssistantSeed({
        toJS: () => ({
          id: "def",
          prompt: "Seeded prompt",
          forceNewTurn: true,
        }),
      }),
    ).toEqual({
      id: "def",
      prompt: "Seeded prompt",
      forceNewTurn: true,
    });
  });
});

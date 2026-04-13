/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  getAgentSpec,
  hasCodingAgent,
  hasEmbeddedAgent,
} from "./agent-registry";

describe("agent-registry", () => {
  it.each([
    "index.html",
    "analysis.r",
    "script.PY",
    "script.R",
    "notebook.jl",
    "main.c",
    "main.cpp",
    "Dockerfile",
    "Makefile",
    "report.qmd",
    "report.rmd",
    "paper.TEX",
    "paper.tex",
    "notes.md",
  ])("enables the coding agent for %s", (path) => {
    expect(hasCodingAgent(path)).toBe(true);
    expect(hasEmbeddedAgent(path)).toBe(true);
  });

  it("routes notebooks to the notebook agent instead of the coding agent", () => {
    expect(hasCodingAgent("worksheet.ipynb")).toBe(false);
    expect(getAgentSpec("worksheet.ipynb").hasAgent).toBe(true);
  });

  it.each(["presentation.slides", "desktop.x11", "diagram.board"])(
    "does not enable embedded agents for %s",
    (path) => {
      expect(hasCodingAgent(path)).toBe(false);
      expect(hasEmbeddedAgent(path)).toBe(false);
    },
  );
});

/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { fromJS, Map as IMap } from "immutable";

import { getOpenEventFilename, normalizeLogFilename } from "./utils";

describe("normalizeLogFilename", () => {
  it("returns a plain string unchanged", () => {
    expect(normalizeLogFilename("foo.tex")).toBe("foo.tex");
  });

  it("returns the .path of a plain object", () => {
    expect(
      normalizeLogFilename({
        ext: "tex",
        path: "foo.tex",
        editorId: "cocalc/latex-editor",
      }),
    ).toBe("foo.tex");
  });

  it("returns the .path of an Immutable Map", () => {
    const m = IMap({ ext: "csv", path: "data.csv", editorId: "x" });
    expect(normalizeLogFilename(m)).toBe("data.csv");
  });

  it("returns the .path of a fromJS-wrapped object", () => {
    const m = fromJS({ ext: "csv", path: "data.csv", editorId: "x" });
    expect(normalizeLogFilename(m)).toBe("data.csv");
  });

  it("returns undefined for null/undefined", () => {
    expect(normalizeLogFilename(null)).toBeUndefined();
    expect(normalizeLogFilename(undefined)).toBeUndefined();
  });

  it("returns undefined when the path field is missing or non-string", () => {
    expect(normalizeLogFilename({ ext: "csv" })).toBeUndefined();
    expect(normalizeLogFilename({ path: 42 })).toBeUndefined();
    expect(normalizeLogFilename(IMap({ ext: "csv" }))).toBeUndefined();
  });
});

describe("getOpenEventFilename", () => {
  it("reads a string filename out of an Immutable entry", () => {
    const entry = fromJS({ event: { event: "open", filename: "foo.tex" } });
    expect(getOpenEventFilename(entry as any)).toBe("foo.tex");
  });

  it("reads the .path out of an object filename", () => {
    const entry = fromJS({
      event: {
        event: "open",
        filename: { ext: "tex", path: "foo.tex", editorId: "x" },
      },
    });
    expect(getOpenEventFilename(entry as any)).toBe("foo.tex");
  });

  it("returns the fallback when filename is missing", () => {
    const entry = fromJS({ event: { event: "open" } });
    expect(getOpenEventFilename(entry as any)).toBeUndefined();
    expect(getOpenEventFilename(entry as any, "x.txt")).toBe("x.txt");
    expect(getOpenEventFilename(entry as any, "")).toBe("");
  });

  it("survives a malformed object filename without throwing", () => {
    const entry = fromJS({
      event: { event: "open", filename: { ext: "tex" } },
    });
    expect(getOpenEventFilename(entry as any)).toBeUndefined();
    expect(getOpenEventFilename(entry as any, "")).toBe("");
  });
});

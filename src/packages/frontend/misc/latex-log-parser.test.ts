import fs from "fs";
import { LatexParser } from "@cocalc/frontend/frame-editors/latex-editor/latex-log-parser";

describe("latex-log-parser", () => {
  test("log1", () => {
    const log1 = fs.readFileSync("./misc/latex-logs/log1.txt", "utf-8");
    const parsed1 = new LatexParser(log1, {
      ignoreDuplicates: true,
    }).parse();
    const err0 = parsed1.errors[0];
    expect(err0.line).toBe(1);
    expect(err0.file).toEqual("subfile.tex");
    expect(parsed1.deps[0]).toEqual("master.tex");
    expect(parsed1.deps[1]).toEqual("subfile.tex");
  });

  // This is an abbrivated log of https://github.com/sagemathinc/cocalc/issues/8089
  test("log2", () => {
    const log2 = fs.readFileSync("./misc/latex-logs/log2.txt", "utf-8");
    const parsed2 = new LatexParser(log2, {
      ignoreDuplicates: true,
    }).parse();
    const err0 = parsed2.all[0];
    expect(err0.file).toEqual("ch_Euclidean.tex");
    expect(err0.message).toEqual("Marginpar on page 1 moved.");
    expect(parsed2.deps).toEqual(["01.tex", "02.5.tex"]);
    expect(parsed2.files).toEqual(["livre1.tex", "ch_Euclidean.tex"]);
  });
});

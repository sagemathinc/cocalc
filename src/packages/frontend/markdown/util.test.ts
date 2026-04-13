/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { backtickSequence } from "./util";

describe("backtickSequence", () => {
  it("returns ``` for text without backticks", () => {
    expect(backtickSequence("hello world")).toBe("```");
  });

  it("returns ``` for text with fewer than 3 consecutive backticks", () => {
    expect(backtickSequence("use `code` here")).toBe("```");
    expect(backtickSequence("a `` b")).toBe("```");
  });

  it("returns ```` when text contains ```", () => {
    expect(backtickSequence("some ```code``` here")).toBe("````");
  });

  it("returns ````` when text contains ````", () => {
    expect(backtickSequence("nested ````block```` inside")).toBe("`````");
  });

  it("handles text that is all backticks", () => {
    expect(backtickSequence("``````")).toBe("```````");
  });

  it("handles empty string", () => {
    expect(backtickSequence("")).toBe("```");
  });

  // --- language parameter ---

  it("appends language to the fence when provided", () => {
    expect(backtickSequence("hello", "python")).toBe("```python");
  });

  it("appends language when fence is longer than 3", () => {
    expect(backtickSequence("some ```code``` here", "latex")).toBe(
      "````latex",
    );
  });

  it("does not append language when undefined", () => {
    expect(backtickSequence("hello", undefined)).toBe("```");
  });

  it("guards content with backticks and adds language", () => {
    const content = 'print("```hello```")';
    const open = backtickSequence(content, "py");
    const close = backtickSequence(content);
    // opening fence has language, closing does not
    expect(open).toBe("````py");
    expect(close).toBe("````");
    // the fenced block is valid markdown
    const md = `${open}\n${content}\n${close}`;
    expect(md).toBe('````py\nprint("```hello```")\n````');
  });

  it("handles deeply nested backticks with language", () => {
    const content = "level1 ``` level2 ```` level3 ````` end";
    const open = backtickSequence(content, "js");
    const close = backtickSequence(content);
    expect(open).toBe("``````js");
    expect(close).toBe("``````");
  });
});

import { describe, it, expect } from "../../frame-editors/generic/test/util";
import { find_matches } from "../find";

describe("test several searches -- ", () => {
  it("a basic search with one match", () => {
    expect(find_matches("a", "xyz\nabc")).to.deep.equal({
      matches: [{ start: 4, stop: 5 }],
    });
  });
  it("an empty search", () => {
    expect(find_matches("", "xyzabc")).to.deep.equal({ matches: [] });
  });
  it("an empty regexp search", () => {
    expect(find_matches("", "xyzabc", false, false)).to.deep.equal({
      matches: [],
    });
  });
  it("a case insensitive search", () => {
    expect(find_matches("A", "xyzabcA", false)).to.deep.equal({
      matches: [
        { start: 3, stop: 4 },
        { start: 6, stop: 7 },
      ],
    });
  });
  it("a case sensitive search", () => {
    expect(find_matches("A", "xyzabc", true)).to.deep.equal({ matches: [] });
  });
  it("another case sensitive search", () => {
    expect(find_matches("A", "xyzabcA", true)).to.deep.equal({
      matches: [{ start: 6, stop: 7 }],
    });
  });
  it("an invalid regexp", () => {
    expect(find_matches("\\", "xyzabc", false, true)).to.deep.equal({
      error:
        "SyntaxError: Invalid regular expression: /\\/: \\ at end of pattern",
    });
  });
  it("a regexp search for all the non whitespace", () => {
    expect(find_matches("\\S+", "ab 123\t z", false, true)).to.deep.equal({
      matches: [
        { start: 0, stop: 2 },
        { start: 3, stop: 6 },
        { start: 8, stop: 9 },
      ],
    });
  });
});

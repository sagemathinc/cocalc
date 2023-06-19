import expect from "expect";
import { times_n } from "./misc";

describe("test times_n", () => {
  it("does what it is supposed to do", () => {
    expect(times_n("x", 3)).toBe("xxx");
  });
});

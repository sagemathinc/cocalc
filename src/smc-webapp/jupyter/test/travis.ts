import { describe, it, expect } from "../../frame-editors/generic/test/util";

describe("Jupyter - testing the tests", function() {
  this.timeout(10000);
  it("1 + 1 = 2", async () => {
    expect(eval("1+1")).to.equal(2);
  });
});

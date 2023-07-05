/*
I'm a little hesistant about testing this since we'll need to make sure that a kernel is
installed, e.g., to test on Github actions.
Probably, the way to go would be to install https://www.npmjs.com/package/ijavascript
and just test that a lot, since it would be the minimal dependency.

There are a lot of ideas for tests in this bitrotted place:

https://github.com/sagemathinc/cocalc/tree/master/src/packages/project/jupyter/test
*/

import expect from "expect";
import { kernel } from "./kernel";

describe("test trying to use a kernel that doesn't exist", () => {
  it("fails", async () => {
    const k = kernel({ name: "no-such-kernel", path: "x.ipynb" });
    await expect(k.execute_code_now({ code: "2+3" })).rejects.toThrow(
      "No spec available for kernel"
    );
  });
});

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Test payload shell message.
*/

import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";

import { startswith, getIn } from "../../smc-util/misc2";

describe("create python2 kernel and do evals with and without payloads -- ", async function () {
  this.timeout(5000);

  const kernel: common.JupyterKernel = common.kernel("test-python2");

  it("does an eval with no payload", async function () {
    const result: any[] = await kernel.execute_code_now({
      code: "2+3",
    });
    for (const x of result) {
      if (getIn(x, ["content", "payload"], []).length > 0) {
        throw Error("there should not be any payloads");
      }
    }
  });

  it("does an eval with a payload (requires internet)", async function () {
    const result: any[] = await kernel.execute_code_now({
      code:
        "%load https://matplotlib.org/mpl_examples/showcase/integral_demo.py",
    });
    for (const x of result) {
      let v;
      if ((v = getIn(x, ["content", "payload"], [])).length > 0) {
        const s =
          '# %load https://matplotlib.org/mpl_examples/showcase/integral_demo.py\n"""\nPlot demonstrating';
        expect(v.length).toBe(1);
        expect(startswith(v[0].text, s)).toBe(true);
        return;
      }
    }
  });

  return it("closes the kernel", function () {
    kernel.close();
  });
});

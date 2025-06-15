/*
I'm a little hesistant about testing this since we'll need to make sure that a kernel is
installed, e.g., to test on Github actions.
Probably, the way to go would be to install https://www.npmjs.com/package/ijavascript
and just test that a lot, since it would be the minimal dependency.

There are a lot of ideas for tests in this bitrotted place:

https://github.com/sagemathinc/cocalc/tree/master/src/packages/project/jupyter/test
*/

import expect from "expect";
import { kernel, type JupyterKernel } from "./kernel";
import { getPythonKernelName } from "./kernel-data";

export async function getPythonKernel(path: string): Promise<JupyterKernel> {
  return kernel({ name: await getPythonKernelName(), path });
}

describe("test trying to use a kernel that doesn't exist", () => {
  it("fails", async () => {
    const k = kernel({ name: "no-such-kernel", path: "x.ipynb" });
    await expect(k.execute_code_now({ code: "2+3" })).rejects.toThrow(
      "No spec available for kernel",
    );
  });
});

describe("create and close python kernel", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python.ipynb");
  });

  it("cleans up", () => {
    k.close();
  });
});

describe("spawn and close python kernel", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python.ipynb");
  });

  it("spawns the kernel", async () => {
    await k.spawn();
  });

  it("cleans up", () => {
    k.close();
  });
});

describe.skip("compute 2+3 using a python kernel", () => {
  let k;
  it("get a python kernel", async () => {
    k = kernel({ name: await getPythonKernelName(), path: "python2.ipynb" });
  });

  it("spawn the kernel", async () => {
    await k.spawn();
  });

  it("evaluate 2+3, confirming the result", async () => {
    const output = k.execute_code({ code: "2+3" });
    output.on("output", console.log);
  });

  it("cleans up", () => {
    k.close();
  });
});

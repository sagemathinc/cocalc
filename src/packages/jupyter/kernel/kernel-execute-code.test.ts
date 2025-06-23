/*
I'm a little hesistant about testing this since we'll need to make sure that a kernel is
installed, e.g., to test on Github actions.
Probably, the way to go would be to install https://www.npmjs.com/package/ijavascript
and just test that a lot, since it would be the minimal dependency.

There are a lot of ideas for tests in this bitrotted place:

https://github.com/sagemathinc/cocalc/tree/master/src/packages/project/jupyter/test
*/

import expect from "expect";
import { getPythonKernel, closeKernels } from "./kernel.test";


describe("a kernel implicitly spawns when you execute code", () => {
  let k;
  it("get and do NOT spawn a python kernel", async () => {
    k = await getPythonKernel("python-spawn.ipynb");
  });

  it.skip("start some code running and see spawning is automatic", async () => {
    const code = "import os; os.getpid()";
    const output = k.execute_code({ code });
    for await (const out of output.iter()) {
      if (out.content?.code) {
        expect(out.content.code).toBe(code);
      }
      if (out.content?.data) {
        const pid = out.content?.data["text/plain"];
        expect(parseInt(pid)).toEqual(k.pid());
        break;
      }
    }
  });

  it("cleans up", () => {
    k.close();
  });
});

describe("test execute_code_now and chdir", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python-chdir.ipynb");
  });

  it("also test the execute_code_now method", async () => {
    const out = await k.execute_code_now({ code: "2+3" });
    const v = out.filter((x) => x.content?.data);
    expect(v[0].content.data["text/plain"]).toBe("5");
  });

  it("also test the chdir method", async () => {
    // before
    const out = await k.execute_code_now({ code: "import os; os.curdir" });
    const v = out.filter((x) => x.content?.data);
    expect(v[0].content.data["text/plain"]).toBe("'.'");

    await k.chdir("/tmp");
    const out2 = await k.execute_code_now({
      code: "os.path.abspath(os.curdir)",
    });
    const v2 = out2.filter((x) => x.content?.data);
    expect(v2[0].content.data["text/plain"]).toBe("'/tmp'");
  });

  it("cleans up", () => {
    k.close();
  });
});

afterAll(() => {
  closeKernels();
});

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

const usedNames = new Set<string>();
const kernels: JupyterKernel[] = [];
export async function getPythonKernel(
  path: string,
  noCheck = false,
): Promise<JupyterKernel> {
  if (!noCheck && usedNames.has(path)) {
    throw Error(`do not reuse names as that is very confusing -- ${path}`);
  }
  usedNames.add(path);
  const k = kernel({ name: await getPythonKernelName(), path });
  kernels.push(k);
  return k;
}

describe("test trying to use a kernel that doesn't exist", () => {
  it("fails", async () => {
    const k = kernel({ name: "no-such-kernel", path: "none.ipynb" });
    await expect(k.execute_code_now({ code: "2+3" })).rejects.toThrow(
      "No spec available for kernel",
    );
  });
});

describe("create and close python kernel", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python-0.ipynb");
  });

  it("cleans up", () => {
    k.close();
  });
});

describe("spawn and close python kernel", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python-1.ipynb");
  });

  it("spawns the kernel", async () => {
    await k.spawn();
  });

  it("cleans up", () => {
    k.close();
  });
});

describe("compute 2+3 using a python kernel", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python-2.ipynb");
  });

  it("spawn the kernel", async () => {
    await k.spawn();
  });

  it("evaluate 2+3, confirming the result", async () => {
    const output = k.execute_code({ code: "2+3" });
    const iter = output.iter();
    const v: any[] = [];
    for await (const x of iter) {
      v.push(x);
    }
    expect(v[0].content).toEqual({ execution_state: "busy" });
    expect(v[1].content).toEqual({ code: "2+3", execution_count: 1 });
    expect(v[2].content.data).toEqual({ "text/plain": "5" });
  });

  it("define a variable in one call, then use it in another", async () => {
    const output = k.execute_code({ code: "a=5" });
    await output.waitUntilDone();
    output.close();
  });

  it("uses that variable in another call", async () => {
    const output = k.execute_code({ code: "a + a" });
    const iter = output.iter();
    await output.waitUntilDone();
    for await (const x of iter) {
      if (x.content?.data) {
        expect(x.content?.data).toEqual({ "text/plain": "10" });
        break;
      }
    }
  });

  it("cleans up", () => {
    k.close();
  });
});

describe("start computation then immediately close the kernel should not crash", () => {
  let k;
  it("get and spawn a python kernel", async () => {
    k = await getPythonKernel("python-4.ipynb");
    await k.spawn();
  });

  it("start something running, then immediately close and see error event is called", async () => {
    const output = k.execute_code({ code: "sleep 10000" });
    for await (const _ of output.iter()) {
      // it's ack'd as running:
      break;
    }
  });

  it("closes during computation", () => {
    k.close();
  });

  it("starts and closes another kernel with the same path", async () => {
    const k2 = await getPythonKernel("python-4.ipynb", true);
    k2.close();
  });
});

describe("a kernel implicitly spawns when you execute code", () => {
  let k;
  it("get and do NOT spawn a python kernel", async () => {
    k = await getPythonKernel("python-spawn.ipynb");
  });

  it("start some code running and see spawning is automatic", async () => {
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

afterAll(() => {
  kernels.map((k) => k.close());
});

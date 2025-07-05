/*
Test the Jupyer stateless api kernel functionality.
*/

import { getPythonKernelName } from "../kernel/kernel-data";
import Kernel, { DEFAULT_POOL_SIZE } from "./kernel";

describe("create a jupyter stateless-api kernel and test basic functionality", () => {
  let kernel;
  it("gets a kernel", async () => {
    const kernelName = await getPythonKernelName();
    // @ts-ignore
    expect(Kernel.getPool(kernelName).length).toBe(0);
    kernel = await Kernel.getFromPool(kernelName);
    // @ts-ignore
    expect(Kernel.getPool(kernelName).length).toBe(DEFAULT_POOL_SIZE);
  });

  it("confirms it is 'running'", () => {
    expect(kernel.kernel.get_state()).toBe("running");
  });

  it("compute 2+3", async () => {
    const output = await kernel.execute("2+3");
    expect(output[0].data["text/plain"]).toBe("5");
  });

  it("exec something with two distinct output messages", async () => {
    const output = await kernel.execute(
      "import sys; sys.stdout.write('1'); sys.stdout.flush(); print('2')",
    );
    expect(output.length).toBe(2);
    expect(output).toEqual([
      { name: "stdout", text: "1" },
      { name: "stdout", text: "2\n" },
    ]);
  });

  it("exec something that throws an error", async () => {
    const output = await kernel.execute("1/0");
    expect(output[0].traceback.join("")).toContain("division by zero");
  });

  it("chdir to /tmp and confirm that", async () => {
    await kernel.chdir("/tmp");
    const output = await kernel.execute(
      "import os; os.path.abspath(os.curdir)",
    );
    expect(output).toEqual([{ data: { "text/plain": "'/tmp'" } }]);
  });

  it("get another kernel and confirm pool is maintained", async () => {
    const kernelName = await getPythonKernelName();
    const kernel2 = await Kernel.getFromPool(kernelName);
    // @ts-ignore
    expect(Kernel.getPool(kernelName).length).toBe(DEFAULT_POOL_SIZE);
    kernel2.close();
  });

  it("cleans up", () => {
    kernel.close();
    Kernel.closeAll();
  });
});

describe("test timeout - this is how long until pool starts getting trimmed", () => {
  let kernel;
  it("gets a kernel from a pool with a 1s timeout", async () => {
    const kernelName = await getPythonKernelName();
    kernel = await Kernel.getFromPool(kernelName, { timeout_s: 1 });
  });

  it("quick eval works", async () => {
    const output = await kernel.execute("389+11");
    expect(output[0].data["text/plain"]).toBe("400");
  });

  it("something that takes more than a second", async () => {
    await kernel.execute("print('hi'); import time; time.sleep(1.2)");
    kernel.close();
  });

  it("now check that the pool started shrinking", async () => {
    const kernelName = await getPythonKernelName();
    // @ts-ignore
    expect(Kernel.getPool(kernelName).length).toBeLessThan(DEFAULT_POOL_SIZE);
  });
});

afterAll(async () => {
  Kernel.closeAll();
});

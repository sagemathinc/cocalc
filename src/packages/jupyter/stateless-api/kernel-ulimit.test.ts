/*
Testing that ulimit is set on the kernels.
*/

import { getPythonKernelName } from "../kernel/kernel-data";
import Kernel from "./kernel";

describe("ulimit is set on the stateless api kernels (and can be configured)", () => {
  let kernel;
  let kernelName;

  it("modifies the pool params so the ulimit is 1 second of CPU usage", async () => {
    kernelName = await getPythonKernelName();
    Kernel.setUlimit(kernelName, "-t 1");
  });

  it("gets a kernel", async () => {
    kernel = await Kernel.getFromPool(kernelName);
  });

  it("quick eval works", async () => {
    const output = await kernel.execute("389+11");
    expect(output[0].data["text/plain"]).toBe("400");
  });

  it("something that takes infinite CPU time gets killed in a second", async () => {
    const start = Date.now();
    try {
      await kernel.execute("while True: sum(range(10**8))");
    } catch (err) {
      expect(`${err}`).toContain("Kernel last exited with code 137.");
    }
    expect(Date.now() - start).toBeLessThan(1500);
  });

  it("cleans up", () => {
    kernel.close();
  });
});

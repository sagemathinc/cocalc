/*
Testing that ulimit is set on the kernels.
*/

import { getPythonKernelName } from "../kernel/kernel-data";
import Kernel from "./kernel";
import { until } from "@cocalc/util/async-utils";

const SECONDS = 2;

jest.setTimeout(10000);
describe("ulimit is set on the stateless api kernels (and can be configured)", () => {
  let kernel;
  let kernelName;

  it(`modifies the pool params so the ulimit is ${SECONDS} second of CPU usage`, async () => {
    kernelName = await getPythonKernelName();
    Kernel.setUlimit(kernelName, `-t ${SECONDS}`);
  });

  it("gets a kernel", async () => {
    // repeat because in rare cases the kernel already in the pool may
    // get the ulimit from starting up python (1s of cpu time is short!)
    await until(
      async () => {
        try {
          kernel = await Kernel.getFromPool(kernelName);
          return true;
        } catch {
          return false;
        }
      },
      { start: 1000 },
    );
  });

  it("quick eval works", async () => {
    const output = await kernel.execute("389+11");
    expect(output[0].data["text/plain"]).toBe("400");
  });

  it(`something that takes infinite CPU time gets killed in at most ${SECONDS} seconds`, async () => {
    const start = Date.now();
    try {
      await kernel.execute("while True: sum(range(10**8))");
    } catch (err) {
      expect(`${err}`).toContain("Kernel last exited with code 137.");
    }
    expect(Date.now() - start).toBeLessThan(SECONDS * 1500);
  });

  it("cleans up", () => {
    kernel.close();
  });
});

afterAll(async () => {
  Kernel.closeAll();
});


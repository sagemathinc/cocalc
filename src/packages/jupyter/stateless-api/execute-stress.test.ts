import { getPythonKernelName } from "../kernel/kernel-data";
import jupyterExecute from "./execute";
import { delay } from "awaiting";
import Kernel from "./kernel";

const count = 3;
jest.setTimeout(15000);
describe(`execute code ${count} times in a row to test for race conditions`, () => {
  // this would randomly hang at one point due to running the init code
  // without using the usual execution queue.
  it("does the test", async () => {
    const kernel = await getPythonKernelName();
    for (let i = 0; i < count; i++) {
      const outputs = await jupyterExecute({ kernel, input: "2+3" });
      expect(outputs).toEqual([{ data: { "text/plain": "5" } }]);
      await delay(100);
    }
  });
});

afterAll(async () => {
  Kernel.closeAll();
});

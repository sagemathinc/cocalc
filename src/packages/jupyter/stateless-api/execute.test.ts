import { getPythonKernelName } from "../kernel/kernel-data";
import jupyterExecute from "./execute";
import Kernel from "./kernel";

describe("test the jupyterExecute function", () => {
  let kernel;

  it(`gets a kernel name`, async () => {
    kernel = await getPythonKernelName();
  });

  it("computes 2+3", async () => {
    const outputs = await jupyterExecute({ kernel, input: "a=5; 2+3" });
    expect(outputs).toEqual([{ data: { "text/plain": "5" } }]);
  });

  it("checks that its stateless, i.e., a is not defined", async () => {
    const outputs = await jupyterExecute({ kernel, input: "print(a)" });
    expect(JSON.stringify(outputs)).toContain("is not defined");
  });

  it("sets a via history", async () => {
    const outputs = await jupyterExecute({
      kernel,
      input: "print(a**2)",
      history: ["a=5"],
    });
    expect(outputs).toEqual([{ name: "stdout", text: "25\n" }]);
  });

  it("limits the output size", async () => {
    const outputs = await jupyterExecute({
      kernel,
      input: "print('hi'); import sys; sys.stdout.flush(); print('x'*100)",
      limits: { max_output_per_cell: 50 },
    });
    expect(outputs).toEqual([
      { name: "stdout", text: "hi\n" },
      {
        name: "stdout",
        output_type: "stream",
        text: [
          "Output truncated since it exceeded the cell output limit of 50 characters",
        ],
      },
    ]);
  });
});

afterAll(async () => {
  Kernel.closeAll();
});


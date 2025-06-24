/*
Test interactive input, which uses the stdin channel

https://jupyter-client.readthedocs.io/en/stable/messaging.html


pnpm test `pwd`/input.test.ts
*/

import { getPythonKernel, closeKernels } from "./util";

describe.only("test that interactive input throws an error if we do not provide a stdin function", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python-nostdin.ipynb");
  });

  it("test without stdin", async () => {
    const code = "a = input('a:')";
    const v: any[] = [];
    // we do not pass a stdin function as an option:
    const output = k.execute_code({ code });
    for await (const out of output.iter()) {
      v.push(out);
    }
    expect(JSON.stringify(v)).toContain("StdinNotImplementedError");
  });

  it("cleans up", () => {
    k.close();
  });
});

describe("test interactive input", () => {
  let k;
  it("get a python kernel", async () => {
    k = await getPythonKernel("python-stdin.ipynb");
  });

  it("start some code running with stdin set and see it is called", async () => {
    const code = "a = input('a:')";
    const v: any[] = [];
    const stdin = async (prompt: string, password: boolean) => {
      console.log("stdin called");
      v.push({ prompt, password });
      return "bar";
    };
    const output = k.execute_code({ code, stdin });
    for await (const out of output.iter()) {
      console.log({ out });
      //       if (out.done) {
      //         console.log("break");
      //         break;
      //       }
    }
    console.log("v = ", v);
    console.log("done!");
  });

  it("cleans up", () => {
    k.close();
  });
});

afterAll(() => {
  closeKernels();
});

import {} from "mocha";

const expect = require("expect");

import { kernel, exec, JupyterKernel } from "./common";

describe("compute 2+3 using python2", function () {
  this.timeout(10000);
  let k: JupyterKernel;

  it("creates a python2 kernel", function () {
    k = kernel("test-python2");
  });

  it("spawn", async function () {
    await k.spawn();
    expect(k.get_state()).toBe("running");
  });

  it("evaluate 2+3", async function () {
    expect(await exec(k, "2+3")).toEqual('{"text/plain":"5"}');
  });

  it("closes the kernel", function () {
    k.close();
    expect(k.get_state()).toBe("closed");
  });
});

describe("compute 2/3 using python3", function () {
  this.timeout(10000);
  let k: JupyterKernel;

  it("creates a python3 kernel", function () {
    k = kernel("test-python3");
  });

  it("spawn", async function () {
    await k.spawn();
    expect(k.get_state()).toBe("running");
  });

  it("evaluate 2/3", async function () {
    expect(await exec(k, "2/3")).toEqual('{"text/plain":"0.6666666666666666"}');
  });

  it("closes the kernel", function () {
    k.close();
    expect(k.get_state()).toBe("closed");
  });
});

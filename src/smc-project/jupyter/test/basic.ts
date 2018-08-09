import {} from "mocha";

const expect = require("expect");

import { kernel, exec } from "./common";

// We use custom kernels for testing, since faster to start.
// For example, we don't use matplotlib inline for testing (much) and
// using it greatly slows down startup.
process.env.JUPYTER_PATH=`${__dirname}/jupyter`

describe("compute 2+3 using python2", function() {
  this.timeout(10000);
  let k: any;

  it("creates a python2 kernel", function() {
    k = kernel("python2-nogui");
  });

  it("spawn", async function() {
    await k.spawn();
    expect(k.get_state()).toBe("running");
  })

  it("evaluate 2+3", async function() {
    expect(await exec(k, "2+3")).toEqual('{"text/plain":"5"}');
  });

  it("closes the kernel", function() {
    k.close();
    expect(k.get_state()).toBe("closed");
  });
});

describe("compute 2/3 using python3", function() {
  this.timeout(10000);
  let k: any;

  it("creates a python3 kernel", function() {
    k = kernel("python3-nogui");
  });

  it("spawn", async function() {
    await k.spawn();
    expect(k.get_state()).toBe("running");
  })

  it("evaluate 2/3", async function() {
    expect(await exec(k, "2/3")).toEqual('{"text/plain":"0.6666666666666666"}');
  });

  it("closes the kernel", function() {
    k.close();
    expect(k.get_state()).toBe("closed");
  });
});


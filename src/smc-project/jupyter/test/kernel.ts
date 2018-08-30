import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";
import { endswith } from "../../smc-webapp/frame-editors/generic/misc";

describe("compute 2+7 using the python2 kernel -- ", function() {
  this.timeout(5000);
  let kernel: common.JupyterKernel = common.kernel("test-python2");

  it("evaluate 2+7", async function() {
    expect(await common.exec(kernel, "2+7")).toBe('{"text/plain":"9"}');
  });

  it("closes the kernel", function() {
    kernel.close();
  });

  it("verifies that executing code after closing the kernel gives an appropriate error", async function() {
    try {
      await kernel.execute_code_now({ code: "2+2" });
    } catch (err) {
      expect(err.toString()).toBe("Error: closed");
    }
  });
});

describe("compute 2/3 using a python3 kernel -- ", function() {
  this.timeout(15000);
  let kernel: common.JupyterKernel = common.kernel("test-python3");

  it("evaluate 2/3", async function() {
    expect(await common.exec(kernel, "2/3")).toBe(
      '{"text/plain":"0.6666666666666666"}'
    );
  });

  return it("closes the kernel", function() {
    kernel.close();
  });
});

describe("it tries to start a kernel that does not exist -- ", function() {
  let kernel: common.JupyterKernel;

  it("creates a foobar kernel", function() {
    kernel = common.kernel("foobar");
    return expect(kernel.get_state()).toBe("off");
  });

  it("then tries to use it, which will fail", async function() {
    try {
      await kernel.execute_code_now({ code: "2+2" });
    } catch (err) {
      expect(err.toString()).toBe("Error: No spec available for foobar");
    }
  });
});

describe("calling the spawn method -- ", function() {
  let kernel = common.kernel("test-python2");
  this.timeout(5000);

  it("observes that the state switches to running", function(done) {
    kernel.on("state", function(state) {
      if (state !== "running") {
        return;
      }
      done();
    });
    kernel.spawn();
  });

  it("observes that the state switches to closed", function(done) {
    kernel.on("state", function(state) {
      if (state !== "closed") {
        return;
      }
      done();
    });
    kernel.close();
  });
});

describe("send signals to a kernel -- ", function() {
  let kernel = common.kernel("test-python2");
  this.timeout(5000);

  it("ensure kernel is running", async function() {
    await kernel.spawn();
  });

  it("start a long sleep running... and interrupt it", async function() {
    // send an interrupt signal to stop the sleep below:
    return setTimeout(() => kernel.signal("SIGINT"), 250);
    expect(await common.exec(kernel, "import time; time.sleep(1000)")).toBe(
      "foo"
    );
  });

  it("send a kill signal", function(done) {
    kernel.on("state", function(state) {
      expect(state).toBe("closed");
      done();
    });
    kernel.signal("SIGKILL");
  });
});

describe("start a kernel in a different directory -- ", function() {
  let kernel: common.JupyterKernel;
  this.timeout(5000);

  it("creates a python2 kernel in current dir", async function() {
    kernel = common.kernel("test-python2");
    expect(
      endswith(
        await common.exec(kernel, 'import os; print(os.path.abspath("."))'),
        "/smc-project/jupyter\n"
      )
    ).toBe(true);
    kernel.close();
  });

  it("creates a python2 kernel with path test/a.ipynb2", async function() {
    kernel = common.kernel("test-python2", "test/a.ipynb2");
    expect(
      endswith(
        await common.exec(kernel, 'import os; print(os.path.abspath("."))'),
        "/smc-project/jupyter/test\n"
      )
    ).toBe(true);
    kernel.close();
  });
});

describe("use the key:value store -- ", function() {
  let kernel = common.kernel("test-python2");
  this.timeout(5000);

  it("tests setting the store", function() {
    kernel.store.set({ a: 5, b: 7 }, { the: "value" });
    expect(kernel.store.get({ b: 7, a: 5 })).toEqual({ the: "value" });
  });

  it("tests deleting from the store", function() {
    kernel.store.delete({ a: 5, b: 7 });
    expect(kernel.store.get({ b: 7, a: 5 })).toBe(undefined);
  });
});

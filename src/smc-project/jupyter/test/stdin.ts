/*
Test backend part of interactive input.
*/

import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";

describe("get input using the python2 kernel -- ", function() {
  this.timeout(10000);
  let kernel: common.JupyterKernel;

  it("creates a python2 kernel", function() {
    kernel = common.kernel("test-python2");
  });

  it("reading input - no prompt", async function() {
    const out = await kernel.execute_code_now({
      code: "print(input())",
      stdin(opts, cb) {
        expect(opts).toEqual({ password: false, prompt: "" });
        cb(undefined, "'cocalc'");
      }
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  it("reading raw_input - no prompt", async function() {
    const out = await kernel.execute_code_now({
      code: "print(raw_input())",
      stdin(opts, cb) {
        expect(opts).toEqual({ password: false, prompt: "" });
        cb(undefined, "cocalc");
      }
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  it("reading input - prompt", async function() {
    const out = await kernel.execute_code_now({
      code: 'print(input("prompt"))',
      stdin(opts, cb) {
        expect(opts).toEqual({ password: false, prompt: "prompt" });
        cb(undefined, "'cocalc'");
      }
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  it("reading raw_input - prompt", async function() {
    const out = await kernel.execute_code_now({
      code: 'print(raw_input("prompt"))',
      stdin(opts, cb) {
        expect(opts).toEqual({ password: false, prompt: "prompt" });
        cb(undefined, "cocalc");
      }
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  it("reading a password", async function() {
    const out = await kernel.execute_code_now({
      code: 'import getpass; print(getpass.getpass("password?"))',
      stdin(opts, cb) {
        expect(opts).toEqual({ password: true, prompt: "password?" });
        cb(undefined, "cocalc");
      }
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  return it("closes the kernel", function() {
    kernel.close();
  });
});

describe("get input using the python3 kernel -- ", function() {
  this.timeout(20000);

  it("do it", async function() {
    const kernel = common.kernel("test-python3");
    const out = await kernel.execute_code_now({
      code: 'print(input("prompt"))',
      stdin(opts, cb) {
        expect(opts).toEqual({ password: false, prompt: "prompt" });
        cb(undefined, "cocalc");
      }
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });
});

describe("get input using the ir kernel -- ", function() {
  this.timeout(20000);

  it("do it", async function() {
    const kernel = common.kernel("test-ir");
    const out = await kernel.execute_code_now({
      code: 'print(readline("prompt"))',
      stdin(opts, cb) {
        expect(opts).toEqual({ password: false, prompt: "prompt" });
        cb(undefined, "cocalc");
      }
    });
    expect(common.output(out)).toEqual('[1] "cocalc"\n');
    kernel.close();
  });
});

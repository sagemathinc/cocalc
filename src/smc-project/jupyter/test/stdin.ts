/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Test backend part of interactive input.
*/

import {} from "mocha";
import * as expect from "expect";
import * as common from "./common";

function stdin_func(expected_prompt, expected_password, value) {
  async function stdin(prompt: string, password: boolean): Promise<string> {
    if (prompt != expected_prompt) {
      return `'bad prompt=${prompt}'`;
    }
    if (password != expected_password) {
      return `'password=${password} should not be set'`;
    }
    return JSON.stringify(value);
  }
  return stdin;
}

describe("get input using the python2 kernel -- ", function () {
  this.timeout(10000);
  let kernel: common.JupyterKernel;

  it("creates a python2 kernel", function () {
    kernel = common.kernel("test-python2");
  });

  it("reading input - no prompt", async function () {
    const out = await kernel.execute_code_now({
      code: "print(input())",
      stdin: stdin_func("", false, "cocalc"),
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  it("reading input - different return", async function () {
    const out = await kernel.execute_code_now({
      code: "print(input())",
      stdin: stdin_func("", false, "sage"),
    });
    expect(common.output(out)).toEqual("sage\n");
  });

  it("reading raw_input - no prompt", async function () {
    const out = await kernel.execute_code_now({
      code: "print(raw_input())",
      stdin: stdin_func("", false, "cocalc"),
    });
    expect(common.output(out)).toEqual('"cocalc"\n');
  });

  it("reading input - prompt", async function () {
    const out = await kernel.execute_code_now({
      code: 'print(input("prompt"))',
      stdin: stdin_func("prompt", false, "cocalc"),
    });
    expect(common.output(out)).toEqual("cocalc\n");
  });

  it("reading raw_input - prompt", async function () {
    const out = await kernel.execute_code_now({
      code: 'print(raw_input("prompt"))',
      stdin: stdin_func("prompt", false, "cocalc"),
    });
    expect(common.output(out)).toEqual('"cocalc"\n');
  });

  it("reading a password", async function () {
    const out = await kernel.execute_code_now({
      code: 'import getpass; print(getpass.getpass("password?"))',
      stdin: stdin_func("password?", true, "cocalc"),
    });
    expect(common.output(out)).toEqual('"cocalc"\n');
  });

  return it("closes the kernel", function () {
    kernel.close();
  });
});

/*
describe("get input using the python3 kernel -- ", function() {
  this.timeout(20000);

  it("do it", async function() {
    const kernel = common.kernel("test-python3");
    const out = await kernel.execute_code_now({
      code: 'print(input("prompt"))',
      stdin: stdin_func("prompt", false, "cocalc")
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
      stdin: stdin_func("prompt", false, "cocalc")
    });
    expect(common.output(out)).toEqual('[1] "cocalc"\n');
    kernel.close();
  });
});

*/

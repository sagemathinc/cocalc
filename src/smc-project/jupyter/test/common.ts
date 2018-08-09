/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { kernel as jupyter_kernel } from "../jupyter";

import { JupyterKernelInterface } from "../../smc-webapp/jupyter/project-interface";
export type JupyterKernel = JupyterKernelInterface;

const json = require("json-stable-stringify");

const DEBUG = !!process.env["DEBUG"];
if (DEBUG) {
  console.log("DEBUG =", DEBUG);
}


// We use custom kernels for testing, since faster to start.
// For example, we don't use matplotlib inline for testing (much) and
// using it greatly slows down startup.
process.env.JUPYTER_PATH = `${__dirname}/jupyter`;
if (DEBUG) {
  console.log(`JUPYTER_PATH='${process.env.JUPYTER_PATH}'`);
}

export function kernel(name: string, path?: string): JupyterKernelInterface {
  if (path == null) {
    path = "";
  }
  return jupyter_kernel({ name, verbose: DEBUG, path });
}

export async function exec(k: JupyterKernel, code: string): Promise<string> {
  return output(await k.execute_code_now({ code: code }));
}

// String summary of key aspect of output, which is useful for testing.
export function output(v: any[]): string {
  let s = "";
  let x: any;
  for (x of v) {
    if (x.content == null) continue;
    if (x.content.data != null) {
      return json(x.content.data);
    }
    if (x.content.text != null) {
      s += x.content.text;
    }
    if (x.content.ename != null) {
      return json(x.content);
    }
  }
  return s;
}

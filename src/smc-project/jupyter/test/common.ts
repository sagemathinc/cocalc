/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { kernel as jupyter_kernel, JupyterKernel } from "../jupyter";

const json = require("json-stable-stringify");

const DEBUG = !!process.env["DEBUG"];
if (DEBUG) {
  console.log("DEBUG =", DEBUG);
}

export function kernel(name: string, path?: string): JupyterKernel {
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

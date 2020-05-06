/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Use clean in-memory blob store for tests.
process.env.JUPYTER_BLOBS_DB_FILE = "memory";

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
export function custom_kernel_path() {
  process.env.JUPYTER_PATH = `${__dirname}/jupyter`;
}
custom_kernel_path();

export function default_kernel_path() {
  process.env.JUPYTER_PATH = "/ext/jupyter";
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

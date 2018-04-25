/*
Some async utils.

(Obviously should be moved somewhere else when the dust settles!)

The two helpful async/await libraries I found are:

   - https://github.com/hunterloftis/awaiting
   - https://github.com/masotime/async-await-utils

*/

import * as awaiting from "awaiting";

// use require for now...
const webapp_client = require("../webapp_client").webapp_client;

export function server_time(): Date {
  return webapp_client.server_time();
}

interface ExecOpts {
  project_id: string;
  path?: string;
  command: string;
  args?: string[];
  timeout?: number;
  network_timeout?: number;
  max_output?: number;
  bash?: boolean;
  aggregate?: any;
  err_on_exit?: boolean;
  allow_post?: boolean; // set to false if genuinely could take a long time
  cb?: Function;
}

// turns a function of opts, which has a cb input into
// an async function that takes an opts with no cb as input.
export async function async_opts(f: Function, opts: ExecOpts) {
  function g(cb: Function) {
    opts.cb = cb;
    f(opts);
  }
  return awaiting.callback(g);
}

export interface ExecOutput {
  stdout: string;
  stderr: string;
  exit_code: number;
  time: number; // time in ms, from user point of view.
}

// async version of the webapp_client exec -- let's you run any code in a project!
export async function exec(opts: ExecOpts): Promise<ExecOutput> {
  return async_opts(webapp_client.exec, opts);
}

/*
THIS SHOULD BE MOVED OUT OF frame-editors/

Some async utils.

(Obviously should be moved somewhere else when the dust settles!)

The two helpful async/await libraries I found are:

   - https://github.com/hunterloftis/awaiting
   - https://github.com/masotime/async-await-utils

*/

import * as awaiting from "awaiting";

// use require for now...
const webapp_client = require("smc-webapp/webapp_client").webapp_client;

export function server_time(): Date {
  return webapp_client.server_time();
}

// turns a function of opts, which has a cb input into
// an async function that takes an opts with no cb as input.
export async function async_opts(f: Function, opts: any) {
  function g(cb: Function) {
    opts.cb = cb;
    f(opts);
  }
  return awaiting.callback(g);
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

interface ReadTextFileOpts {
  project_id: string;
  path: string;
  timeout?: number;
}

export async function read_text_file_from_project(
  opts: ReadTextFileOpts
): Promise<string> {
  let mesg = await async_opts(webapp_client.read_text_file_from_project, opts);
  return mesg.content;
}

interface ParserOptions {
  parser: string;
  tabWidth?: number;
  useTabs?: boolean;
}

export async function prettier(
  project_id: string,
  path: string,
  options: ParserOptions
): Promise<void> {
  let resp = await async_opts(webapp_client.prettier, {
    project_id,
    path,
    options
  });
  if (resp.status === "error") {
    let loc = resp.error.loc;
    if (loc && loc.start) {
      throw Error(
        `Syntax error prevented formatting code (possibly on line ${
          loc.start.line
        } column ${loc.start.column}) -- fix and run again.`
      );
    } else {
      throw Error("Syntax error prevented formatting code.");
    }
  }
}

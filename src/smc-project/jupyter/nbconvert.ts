/*
Node.js interface to nbconvert.
*/

require('coffee-register');

const { execute_code } = require("smc-util-node/misc_node");
const { callback_opts } = require("smc-util/async-utils");

interface nbconvertParams {
  args: string[];
  directory?: string;
  timeout?: number;
}

export async function nbconvert(opts: nbconvertParams) : Promise<void> {
  if (!opts.timeout) {
    opts.timeout = 30;
  }
  let j: number = 0;
  let to: string = '';
  for (let i = 0; i < opts.args.length; i++) {
    if (opts.args[i] === "--to") {
      j = i;
      to = opts.args[i + 1];
      break;
    }
  }
  let command: string;
  let args: string[];
  if (to === "sagews") {
    // support sagews converter, which is its own script, not in nbconvert.
    // NOTE that if to is set, then j must be set.
    command = "smc-ipynb2sagews";
    args = opts.args.slice(0, j).concat(opts.args.slice(j + 3)); // j+3 cuts out --to and --.
  } else {
    command = "jupyter";
    args = ["nbconvert"].concat(opts.args);
  }
  // Note about bash/ulimit_timeout below.  This is critical since nbconvert
  // could launch things like pdflatex that might run forever and without
  // ulimit they do not get killed properly; this has happened in production!
  const output = await callback_opts(execute_code)({
    command,
    args,
    path: opts.directory,
    err_on_exit: false,
    timeout: opts.timeout, // in seconds
    ulimit_timeout: true,
    bash: true
  });
  if(output.exit_code != 0) {
    throw Error(output.stderr);
  }
}

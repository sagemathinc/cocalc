// BSD 2-clause

// This is just https://www.npmjs.com/package/daemonize-process
// but they stopped supporting commonjs, and we need commonjs or
// to build via typescript, and I don't have the time to stress
// for hours about a 20 line function!

import { spawn } from 'node:child_process';
import { env, cwd, execPath, argv, exit } from 'node:process';

const id = "_DAEMONIZE_PROCESS";
function daemonizeProcess(opts = {}) {
  if (id in env) {
    delete env[id];
  } else {
    const o = {
      // spawn options
      env: Object.assign(env, opts.env, { [id]: "1" }),
      cwd: cwd(),
      stdio: "ignore",
      detached: true,
      // custom options
      node: execPath,
      script: argv[1],
      arguments: argv.slice(2),
      exitCode: 0,
      ...opts
    };
    const args = [o.script, ...o.arguments];
    const proc = spawn(o.node, args, o);
    proc?.unref?.();
    exit(o.exitCode);
  }
}

export { daemonizeProcess };

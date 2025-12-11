/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// parses command line arguments -- https://github.com/visionmedia/commander.js/
import { program } from "commander";

interface Options {
  hubPort: number;
  browserPort: number;
  hostname: string;
  kucalc: boolean;
  daemon: boolean;
  sshd: boolean;
  init: string;
}

const DEFAULTS: Options = {
  hubPort: 0,
  browserPort: 0,
  // It's important to make the hostname '127.0.0.1' instead of 'localhost',
  // and also be consistent with packages/server/projects/control/util.ts
  // The distinction can of course matter, e.g,. using '127.0.0.1' causes
  // our server to ONLY listen on ipv4, but the client will try 'localhost'
  // which on some hosts will resolve to an ipv6 address ::1 first and that
  // fails.  There's no way to just easily listen on both ipv4 and ipv6 interfaces.
  // I noticed that with express if you use localhost you get ipv6 only, and
  // with http-proxy if you use localhost you get ipv4 only, so things are
  // just totally broken.  So we explicitly use 127.0.0.1 to force things to
  // be consistent.
  hostname: "127.0.0.1",
  kucalc: false,
  daemon: false,
  sshd: false,
  init: "",
};

program
  .name("cocalc-project")
  .usage("[?] [options]")
  .option(
    "--hub-port <n>",
    "TCP server port to listen on (default: 0 = random OS assigned); hub connects to this",
    (n) => parseInt(n),
    DEFAULTS.hubPort,
  )
  .option(
    "--browser-port <n>",
    "HTTP server port to listen on (default: 0 = random OS assigned); browser clients connect to this",
    (n) => parseInt(n),
    DEFAULTS.browserPort,
  )
  .option(
    "--hostname [string]",
    'hostname of interface to bind to (default: "127.0.0.1")',
    DEFAULTS.hostname,
  )
  .option("--kucalc", "Running in the kucalc environment")
  .option(
    "--sshd",
    "Start the SSH daemon (setup script and configuration must be present)",
  )
  .option(
    "--init [string]",
    "Runs the given script via bash and redirects output to .log and .err files.",
  )
  .option("--daemon", "Run as a daemon");

let OPTIONS: Options | null = null;

function init(argv = process.argv): Options {
  if (OPTIONS) return OPTIONS;
  program.parse(argv);
  const opts = program.opts();
  for (const key in opts) {
    DEFAULTS[key] = opts[key];
  }
  OPTIONS = DEFAULTS;
  return OPTIONS;
}

export function getOptions() {
  return init();
}

// If invoked directly, parse immediately (normal CLI behavior).
if (require.main === module) {
  init();
}

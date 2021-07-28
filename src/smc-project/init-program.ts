/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// parses command line arguments -- https://github.com/visionmedia/commander.js/
import { program } from "commander";

interface Options {
  hubPort: number;
  browserPort: number;
  hostname: string;
  kucalc: boolean;
  testFirewall: boolean;
  daemon: boolean;
}

let options = {
  hubPort: 0,
  browserPort: 0,
  hostname: "127.0.0.1",
  testFirewall: false,
  kucalc: false,
  daemon: false,
} as Options;

export { options };

program
  .name("cocalc-project")
  .usage("[?] [options]")
  .option(
    "--hub-port <n>",
    "TCP server port to listen on (default: 0 = random OS assigned); hub connects to this",
    (n) => parseInt(n),
    options.hubPort
  )
  .option(
    "--browser-port <n>",
    "HTTP server port to listen on (default: 0 = random OS assigned); browser clients connect to this",
    (n) => parseInt(n),
    options.browserPort
  )
  .option(
    "--hostname [string]",
    'hostname of interface to bind to (default: "127.0.0.1")',
    options.hostname
  )
  .option("--kucalc", "Running in the kucalc environment")
  .option(
    "--test-firewall",
    "Abort and exit w/ code 99 if internal GCE information *is* accessible"
  )
  .option("--daemon", "Run as a daemon")
  .parse(process.argv);

export default function init(): Options {
  const opts = program.opts();
  for (const key in opts) {
    options[key] = opts[key];
  }
  return options;
}

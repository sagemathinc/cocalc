/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// parses command line arguments -- https://github.com/visionmedia/commander.js/
const { program } = require("commander");

program
  .name("my-command")
  .usage("[?] [options]")
  .option(
    "--tcp_port <n>",
    "TCP server port to listen on (default: 0 = os assigned)",
    (n) => parseInt(n),
    0
  )
  .option(
    "--raw_port <n>",
    "RAW server port to listen on (default: 0 = os assigned)",
    (n) => parseInt(n),
    0
  )
  .option(
    "--console_port <n>",
    "port to find console server on (optional; uses port file if not given); if this is set we assume some other system is managing the console server and do not try to start it -- just assume it is listening on this port always",
    (n) => parseInt(n),
    0
  )
  .option("--kucalc", "Running in the kucalc environment")
  .option(
    "--test_firewall",
    "Abort and exit w/ code 99 if internal GCE information is accessible"
  )
  .option(
    "--test",
    "Start up everything, then immediately exit.  Used as a test and to ensure coffeescript and typescript is compiled/cache"
  )
  .parse(process.argv);

exports.program = program.opts(); // note -- clients of this code only worry about what options got set.

const IN_KUCALC = !!program.opts().kucalc;
exports.running_in_kucalc = () => IN_KUCALC;

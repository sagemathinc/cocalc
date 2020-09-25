/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE: this must stay as javascript as long as local_hub and client are…

// parses command line arguments -- https://github.com/visionmedia/commander.js/
const program = require("commander");

program
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

const do_not_laod_transpilers = program.kucalc && !program.test;

exports.program = program;
exports.do_not_laod_transpilers = do_not_laod_transpilers;

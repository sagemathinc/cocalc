/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// run via mocha by adding '--require ./coffee-coverage-loader.js'
// https://github.com/benbria/coffee-coverage/blob/master/docs/HOWTO-istanbul.md

var path = require("path");

/* CJSX feature request here: https://github.com/benbria/coffee-coverage/issues/52 */
var coffeeCoverage = require("coffee-coverage");
var projectRoot = path.resolve(__dirname);
var coverageVar = coffeeCoverage.findIstanbulVariable();
// Only write a coverage report if we're not running inside of Istanbul.
var writeOnExit =
  coverageVar == null ? projectRoot + "/coverage/coverage-coffee.json" : null;

coffeeCoverage.register({
  instrumentor: "nyc",
  basePath: projectRoot,
  exclude: ["/test", "/node_modules"],
  coverageVar: coverageVar,
  writeOnExit: writeOnExit,
  initAll: true,
});

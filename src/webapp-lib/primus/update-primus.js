/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const fs = require("fs");
const path = require("path");
const program = require("commander");
const BASE_PATH = require("smc-util-node/base-path").default;

function update() {
  const opts = { pathname: path.join(BASE_PATH, "hub") };
  console.log(opts);
  const primus = new require("primus")(require("http").createServer(), opts);
  fs.writeFileSync("primus-engine.js", primus.library());
  process.exit();
}

program.usage("[options]").parse(process.argv);

update();

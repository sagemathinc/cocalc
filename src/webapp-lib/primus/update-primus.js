/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

const fs = require("fs");
const path = require("path");
const program = require("commander");

const path_to_base_url = path.join(
  process.env["SALVUS_ROOT"],
  "data",
  "base_url"
);

let BASE_URL = process.env.BASE_URL;
if (BASE_URL == null) {
  BASE_URL = fs.existsSync(path_to_base_url)
    ? fs.readFileSync(path_to_base_url).toString().trim()
    : "";
}

function update() {
  const opts = { pathname: path.join(BASE_URL, "/hub") };
  console.log(opts);
  const primus = new require("primus")(require("http").createServer(), opts);
  fs.writeFileSync("primus-engine.js", primus.library());
  process.exit();
}

program.usage("[options]").parse(process.argv);

update();

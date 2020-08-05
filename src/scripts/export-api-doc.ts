/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// run via
// $ tsc export-api-doc.ts  && node export-api-doc.js
// or if you have node-ts: $ ts-node scripts/export-api-doc.ts
// then copy 'api.json' over to the root of cocalc-doc

import { writeFileSync } from "fs";
import { execSync } from "child_process";

const api_root = "/api/v1/";
const api_doc = require("../smc-util/message").documentation;
api_doc.root = api_root;
api_doc.timestamp = new Date().toISOString();
const gitrev = execSync("git rev-parse HEAD");
api_doc.gitrev = gitrev.toString().split("\n")[0].trim();

writeFileSync("api.json", JSON.stringify(api_doc, null, 2));

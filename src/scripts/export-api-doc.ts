#!/usr/bin/env ts-node-script

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// run this file as usual: $ export-api-doc.ts (exec in your PATH) or
// $ ts-node scripts/export-api-doc.ts
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

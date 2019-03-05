// run via
// $ tsc export-api-doc.ts  && nodejs export-api-doc.js
// then copy 'api.json' over to the root of cocalc-doc

import { writeFileSync } from "fs";
import { execSync } from "child_process";

const api_root = "/api/v1/";
const api_doc = require("../smc-util/message").documentation;
api_doc.root = api_root;
api_doc.timestamp = new Date().toISOString();
const gitrev = execSync("git rev-parse HEAD");
api_doc.gitrev = gitrev
  .toString()
  .split("\n")[0]
  .trim();

writeFileSync("api.json", JSON.stringify(api_doc, null, 2));

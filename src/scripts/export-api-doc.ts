// run via
// $ tsc export-api-doc.ts  && nodejs export-api-doc.js
// then copy 'api.json' over to the root of cocalc-doc


import { writeFileSync } from "fs";

const api_root = "/api/v1/";
const api_doc = require("../smc-util/message").documentation;
api_doc.root = api_root;

writeFileSync('api.json', JSON.stringify(api_doc, null, 2))
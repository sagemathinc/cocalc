/*
Read a text file.

EXAMPLE:

curl -u `cat .smc/secret_token`: -d path=a.txt -d content="bar" http://localhost:`cat .smc/api-server.port`/api/v1/write-text-file
*/

import { readFile } from "node:fs/promises";

import { client } from "./server";

export default async function readTextFile({ path }): Promise<string> {
  if (client == null) throw Error("client must be defined");

  const dbg = client.dbg("read-text-file");
  dbg(`path="${path}"`);
  if (typeof path != "string") {
    throw Error(`provide the path as a string -- got path="${path}"`);
  }

  return (await readFile(path)).toString();
}

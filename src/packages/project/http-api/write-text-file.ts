/*
Write a text file.

EXAMPLE:

curl -u `cat .smc/secret_token`: -d path=a.txt -d content="bar" http://localhost:`cat .smc/api-server.port`/api/v1/write-text-file
*/

import { writeFile } from "node:fs/promises";

import { client } from "./server";

export default async function writeTextFile({ path, content }): Promise<void> {
  if (client == null) throw Error("client must be defined");

  const dbg = client.dbg("write-text-file");
  dbg(`path="${path}"`);
  if (typeof path != "string") {
    throw Error(`provide the path as a string -- got path="${path}"`);
  }
  if (typeof content != "string") {
    throw Error(
      `provide the content as a string -- got content of type ${typeof content}`
    );
  }

  return await writeFile(path, content);
}

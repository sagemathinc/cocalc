/*
Write a text file.

EXAMPLE:

curl -u `cat .smc/secret_token`: -d path=a.txt -d content="bar" http://localhost:`cat .smc/api-server.port`/api/v1/write-text-file
*/

import { promisify } from "util";
import { writeFile } from "fs";
import { client } from "./server";

export default async function writeTextFile({ path, content }): Promise<void> {
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

  return await promisify(writeFile)(path, content);
}

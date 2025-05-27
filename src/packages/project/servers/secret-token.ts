/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Generate the "secret_token" if it does not already exist.
*/

import { callback } from "awaiting";
import { randomBytes } from "crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { secretToken as secretTokenPath } from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

const winston = getLogger("secret-token");

// We use an n-character cryptographic random token, where n
// is given below.  If you want to change this, changing only
// the following line should be safe.
const LENGTH = 128;

let secretToken: string = ""; // not yet initialized

async function createSecretToken(): Promise<string> {
  winston.info(`creating '${secretTokenPath}'`);

  secretToken = (await callback(randomBytes, LENGTH)).toString("base64");
  await writeFile(secretTokenPath, secretToken);
  // set restrictive permissions; shouldn't be necessary
  await chmod(secretTokenPath, 0o600);
  return secretToken;
}

export default async function init(): Promise<string> {
  try {
    winston.info(`checking for secret token in "${secretTokenPath}"`);
    secretToken = (await readFile(secretTokenPath)).toString();
    return secretToken;
  } catch (err) {
    return await createSecretToken();
  }
}

export function getSecretToken(): string {
  if (secretToken == "") {
    throw Error("secret token not yet initialized");
  }
  return secretToken;
}

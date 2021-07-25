/*
Generate the "secret_token" file if it does not already exist.
*/

import { writeFile, chmod, readFile } from "fs";
import { randomBytes } from "crypto";
import { callback } from "awaiting";
import { getLogger } from "smc-project/logger";
import { secretToken as secretTokenPath } from "smc-project/data";

const winston = getLogger("secret-token");

// We use an n-character cryptographic random token, where n
// is given below.  If you want to change this, changing only
// the following line should be safe.
const LENGTH = 128;

let secretToken: string = ""; // not yet initialized
export { secretToken };

async function createSecretToken(): Promise<string> {
  winston.info(`creating '${secretTokenPath}'`);

  secretToken = (await callback(randomBytes, LENGTH)).toString("base64");
  await callback(writeFile, secretTokenPath, secretToken);
  // set restrictive permissions; shouldn't be necessary
  await callback(chmod, secretTokenPath, 0o600);
  return secretToken;
}

export default async function init(): Promise<string> {
  try {
    winston.info(`checking for secret token in "${secretTokenPath}"`);
    secretToken = (await callback(readFile, secretTokenPath)).toString();
    return secretToken;
  } catch (err) {
    return await createSecretToken();
  }
}

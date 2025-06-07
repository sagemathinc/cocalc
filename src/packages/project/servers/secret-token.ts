/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Generate the "secret_token" if it does not already exist.
*/

import { secureRandomString } from "@cocalc/backend/misc";
import { chmod, writeFile, readFile } from "node:fs/promises";
import {
  secretToken as secretTokenPath,
  secretTokenValue,
} from "@cocalc/project/data";
import { getLogger } from "@cocalc/project/logger";

const logger = getLogger("secret-token");

// We use an n-character cryptographic random token, where n
// is given below.  If you want to change this, changing only
// the following line should be safe.
const LENGTH = 32;

let secretToken: string = secretTokenValue;

let initialized = false;
export default async function init(): Promise<string> {
  if (initialized) {
    return secretToken;
  }
  if (secretTokenValue) {
    logger.debug("writing secret token from environment to ", secretTokenPath);
    try {
      await writeFile(secretTokenPath, secretTokenValue);
      await chmod(secretTokenPath, 0o600);
    } catch (err) {
      logger.debug(
        `WARNING: failed to writing secret token from environment to -- ${err}`,
      );
    }
  } else {
    try {
      logger.debug(`trying to read secret token from '${secretTokenPath}'`);
      secretToken = (await readFile(secretTokenPath)).toString();
    } catch (err) {
      logger.debug(
        `WARNING: failed to read secret token from '${secretTokenPath}' so generating (not going to work!) -- ${err}`,
      );
      secretToken = await secureRandomString(LENGTH);
      await writeFile(secretTokenPath, secretToken);
      await chmod(secretTokenPath, 0o600);
    }
  }
  if (!secretToken) {
    throw Error("secret token not properly initialized");
  }
  initialized = true;
  return secretToken;
}

export function getSecretToken(): string {
  if (!secretToken) {
    throw Error("secret token not properly initialized");
  }
  return secretToken;
}

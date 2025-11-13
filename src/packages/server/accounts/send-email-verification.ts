/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import { verify_email_send_token } from "@cocalc/server/hub/auth";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { isValidUUID } from "@cocalc/util/misc";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:send-email-verification");

export default async function sendEmailVerification(
  account_id: string,
  only_verify = true,
): Promise<string | undefined> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is not valid");
  }
  try {
    await cb2(verify_email_send_token, {
      account_id,
      only_verify,
      database: db(),
    });
    logger.debug(
      `successful sent verification email for account_id=${account_id}`,
    );
  } catch (err) {
    logger.debug(
      `failed to send verification email for account_id=${account_id} -- ${err}`,
    );
    return err.message;
  }
  return "";
}

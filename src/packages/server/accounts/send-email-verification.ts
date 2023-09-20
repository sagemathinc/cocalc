/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import { verify_email_send_token } from "@cocalc/server/hub/auth";
import { callback2 as cb2 } from "@cocalc/util/async-utils";
import { isValidUUID, is_valid_email_address } from "@cocalc/util/misc";

export default async function sendEmailVerification(
  account_id: string,
  email_address: string,
): Promise<string | undefined> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id is not valid");
  }
  if (!is_valid_email_address(email_address)) {
    throw Error("email address is not valid");
  }

  try {
    await cb2(verify_email_send_token, {
      account_id,
      email_address,
      only_verify: true,
      database: db(),
    });
  } catch (err) {
    return err.message;
  }
  return "";
}

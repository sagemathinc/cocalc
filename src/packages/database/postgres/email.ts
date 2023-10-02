/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getAccountId from "@cocalc/database/pool/account/get";
import getPool from "../pool";
import { isValidEmailToken } from "./valid-email-token";

export async function getEmailNotificationSettings({
  email_address,
  token,
}: {
  email_address: string;
  token: string;
}): Promise<{ [key: string]: boolean | object }> {
  const account_id = await getAccountId({ email_address });
  if (account_id == null) {
    throw new Error(`no account with email address '${email_address}'`);
  }
  if (!isValidEmailToken({ account_id, email_address, token })) {
    throw new Error(`invalid email token`);
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT settings FROM notification_settings WHERE account_id=$1::UUID`,
    [account_id]
  );
  if (rows.length === 0) {
    throw new Error(`no account with id '${account_id}'`);
  }
  return rows[0];
}

export async function getEmailAddressOfAccount(account_id): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT email_address FROM accounts WHERE account_id=$1::UUID`,
    [account_id]
  );
  if (rows.length === 0) {
    throw new Error(`no account with id '${account_id}'`);
  }
  return rows[0].email_address;
}

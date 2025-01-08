import type { Description } from "@cocalc/util/db-schema/token-actions";
import getPool from "@cocalc/database/pool";
import makePayment, { extraInfo as makePaymentExtraInfo } from "./make-payment";
import { studentPay, extraInfo as studentPayExtraInfo } from "./student-pay";
import {
  disableDailyStatements,
  extraInfo as dailyStatementsExtraInfo,
} from "./daily-statements";

/*
If a user visits the URL for an action link, then this gets called.
*/

export default async function handleTokenAction(
  token: string,
  account_id: string | undefined,
): Promise<{ description: Description; data: any }> {
  const description = await getTokenDescription(token, account_id);
  const data = await handleDescription(token, description, account_id);
  return {
    description,
    data,
  };
}

async function handleDescription(
  token: string,
  description: Description,
  account_id: string | undefined,
): Promise<any> {
  switch (description.type) {
    case "disable-daily-statements":
      return await disableDailyStatements(description.account_id);
    case "make-payment":
      return await makePayment(token, description);
    case "student-pay":
      return await studentPay(token, description, account_id);
    default:
      // @ts-ignore
      throw Error(`action of type ${description.type} not implemented`);
  }
}

export async function getTokenDescription(
  token: string,
  account_id?: string,
): Promise<Description> {
  if (!token || token.length < 20) {
    throw Error(`invalid token: '${token}'`);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT expire, description FROM token_actions WHERE token=$1",
    [token],
  );
  if (rows.length == 0) {
    throw Error(`The token '${token}' has expired or does not exist.`);
  }
  if (rows[0].expire <= new Date()) {
    await pool.query("DELETE FROM token_actions WHERE token=$1", [token]);
    throw Error(`The token '${token}' has expired.`);
  }
  const { description } = rows[0];
  if (description == null) {
    throw Error(`invalid token ${token}`);
  }
  return await includeExtraInfo(description, account_id, token);
}

async function includeExtraInfo(
  description: Description,
  account_id: string | undefined,
  token: string,
) {
  switch (description.type) {
    case "disable-daily-statements":
      return await dailyStatementsExtraInfo(description);
    case "student-pay":
      return await studentPayExtraInfo(description, account_id);
    case "make-payment":
      return await makePaymentExtraInfo(description, token);
    default:
      return description;
  }
}

import type { Description } from "@cocalc/util/db-schema/token-actions";
import getPool from "@cocalc/database/pool";
import getName from "@cocalc/server/accounts/get-name";
import makePayment from "./make-payment";
import cancelSubscription from "@cocalc/server/purchases/cancel-subscription";

/*
If a user visits the URL for an action link, then this gets called.
*/

export default async function handleTokenAction(
  token: string
): Promise<{ description: Description; data: any }> {
  const description = await getTokenDescription(token, false);
  try {
    return {
      description,
      data: await handleDescription(description),
    };
  } finally {
    const pool = getPool();
    await pool.query("DELETE FROM token_actions WHERE token=$1", [token]);
  }
}

async function handleDescription(description: Description): Promise<any> {
  switch (description.type) {
    case "disable-daily-statements":
      return await disableDailyStatements(description.account_id);
    case "make-payment":
      return await makePayment(description);
    case "cancel-subscription":
      return await handleCancelSubscription(description);
    default:
      // @ts-ignore
      throw Error(`action of type ${description.type} not implemented`);
  }
}

async function includeExtraInfoInDescription(description: Description) {
  switch (description.type) {
    case "student-pay":
      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT course FROM projects WHERE project_id=$1",
        [description.project_id]
      );
      return { ...description, course: rows[0]?.course };
    default:
      return description;
  }
}

async function disableDailyStatements(account_id: string) {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET email_daily_statements=false WHERE account_id=$1",
    [account_id]
  );
  return {
    text: `Disabled sending daily statements for ${await getName(
      account_id
    )}. You can enable emailing of daily statements in the Daily Statements panel of the settings/statements page.`,
  };
}

async function handleCancelSubscription({ account_id, subscription_id }) {
  await cancelSubscription({ account_id, subscription_id });
  return {
    text: `Successfully canceled subscription with id ${subscription_id} for ${await getName(
      account_id
    )}. You can resume the subscription at any time in the settings/subscriptions page.`,
  };
}

export async function getTokenDescription(
  token: string,
  includeExtraInfo?: boolean
): Promise<Description> {
  if (!token || token.length < 20) {
    throw Error(`invalid token: '${token}'`);
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT expire, description FROM token_actions WHERE token=$1",
    [token]
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
  if (includeExtraInfo) {
    return await includeExtraInfoInDescription(description);
  }
  return description;
}

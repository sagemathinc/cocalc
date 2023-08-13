import type { Description } from "@cocalc/util/db-schema/token-actions";
import getPool from "@cocalc/database/pool";
import getName from "@cocalc/server/accounts/get-name";
import makePayment from "./make-payment";
import cancelSubscription from "@cocalc/server/purchases/cancel-subscription";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import { getCost } from "@cocalc/server/purchases/student-pay";
import { currency } from "@cocalc/util/misc";
import getBalance from "@cocalc/server/purchases/get-balance";
import getMinBalance from "@cocalc/server/purchases/get-min-balance";
import studentPay from "./student-pay";

/*
If a user visits the URL for an action link, then this gets called.
*/

export default async function handleTokenAction(
  token: string,
  account_id: string | undefined
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
  account_id: string | undefined
): Promise<any> {
  switch (description.type) {
    case "disable-daily-statements":
      return await disableDailyStatements(description.account_id);
    case "make-payment":
      return await makePayment(description);
    case "student-pay":
      return await studentPay(token, description, account_id);
    case "cancel-subscription":
      return await handleCancelSubscription(description);
    default:
      // @ts-ignore
      throw Error(`action of type ${description.type} not implemented`);
  }
}

async function includeExtraInfoInDescription(
  description: Description,
  account_id?: string
) {
  switch (description.type) {
    case "disable-daily-statements":
      return {
        ...description,
        title: `Stop Emailing Daily Statements`,
        details: `Would you like to disable emailing daily statements to ${await getName(
          description.account_id
        )} at ${await getEmailAddress(
          description.account_id
        )}? You will still receive *monthly statements* by email.  Daily statements will also still be created and can be [viewed in the statements page](/settings/statements).`,
        okText: "Stop Emailing Daily Statements",
        icon: "calendar",
      };
    case "student-pay":
      if (!account_id) {
        return { ...description, signIn: true };
      }
      const pool = getPool();
      const { rows } = await pool.query(
        "SELECT course FROM projects WHERE project_id=$1",
        [description.project_id]
      );
      const { course } = rows[0] ?? {};
      if (course == null) {
        throw Error("Invalid token -- not a course project.");
      }
      const cost = getCost(course.payInfo);
      const balance = await getBalance(account_id);
      const balanceAfterPay = balance - cost;
      const minBalance = await getMinBalance(account_id);
      const due = Math.max(0, minBalance - balanceAfterPay);
      let okText;
      let cancelText: string | undefined = undefined;
      if (course.paid) {
        okText = "";
        cancelText = "Close";
      } else if (due > 0) {
        okText = `Add ${currency(due)} to my account`;
      } else {
        okText = "Pay course fee";
      }
      return {
        ...description,
        due,
        title: "Pay Course Fee",
        details: course.paid
          ? `The ${currency(cost)} course fee has already been paid. Thank you!`
          : `- The course fee of ${currency(cost)} for ${await getName(
              course.account_id
            )} has not yet been paid to upgrade [this project](/projects/${
              description.project_id
            }).${
              due == 0
                ? "\n\n- You can pay this now from your current balance without having to add money to your account."
                : `\n\n- To pay you will first have to add \\${currency(
                    due
                  )} to your account.`
            } \n\n- Your balance is \\${currency(
              balance
            )}, which must stay above \\${currency(minBalance)}.`,
        okText,
        cancelText,
        icon: "graduation-cap",
      };
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
    )}. Daily statements will also still be created and [can be viewed in the statements page](/settings/statements).`,
  };
}

async function handleCancelSubscription({ account_id, subscription_id }) {
  await cancelSubscription({ account_id, subscription_id });
  return {
    text: `Successfully canceled subscription with id ${subscription_id} for ${await getName(
      account_id
    )}. You can resume the subscription at any time [in the subscriptions page](/settings/statements).`,
  };
}

export async function getTokenDescription(
  token: string,
  account_id?: string
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
  return await includeExtraInfoInDescription(description, account_id);
}

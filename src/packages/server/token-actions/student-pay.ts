import createStripeCheckoutSession from "@cocalc/server/purchases/create-stripe-checkout-session";
import { currency } from "@cocalc/util/misc";
import getName from "@cocalc/server/accounts/get-name";
import { getTokenUrl } from "./create";
import studentPayPurchase from "@cocalc/server/purchases/student-pay";
import type { Description } from "@cocalc/util/db-schema/token-actions";
import getPool from "@cocalc/database/pool";
import { getCost } from "@cocalc/server/purchases/student-pay";
import getBalance from "@cocalc/server/purchases/get-balance";
import getMinBalance from "@cocalc/server/purchases/get-min-balance";

export async function studentPay(token, description, account_id): Promise<any> {
  if (description.due > 0) {
    const amount = description.due;
    const user = await getName(account_id);
    const url = await getTokenUrl(token);
    const session = await createStripeCheckoutSession({
      account_id,
      amount,
      description: `Add ${currency(
        amount
      )} to your account (signed in as ${user}).`,
      success_url: url,
      cancel_url: url,
      force: true,
    });
    return {
      session,
      instructions: `Click here to deposit ${currency(
        amount
      )} into ${user}'s account...`,
    };
  } else {
    // should have enough money, so actually make the purchase
    return await studentPayPurchase({
      account_id,
      project_id: description.project_id,
      allowOther: true,
    });
  }
}

export async function extraInfo(description: Description, account_id?: string) {
  if (description.type != "student-pay") {
    throw Error("description must be of type student-pay");
  }
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
}

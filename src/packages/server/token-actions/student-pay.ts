import { moneyRound2Up, moneyToCurrency, toDecimal } from "@cocalc/util/money";
import getName from "@cocalc/server/accounts/get-name";
import studentPayPurchase from "@cocalc/server/purchases/student-pay";
import type { Description } from "@cocalc/util/db-schema/token-actions";
import getPool from "@cocalc/database/pool";
import { getCost } from "@cocalc/server/purchases/student-pay";
import getBalance from "@cocalc/server/purchases/get-balance";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { STUDENT_PAY } from "@cocalc/util/db-schema/purchases";
import type { LineItem } from "@cocalc/util/stripe/types";

export async function studentPay(
  _token,
  description,
  account_id,
): Promise<any> {
  if (description.due > 0) {
    return {
      type: "create-credit",
      pay: description.payment,
    };
  } else {
    // should have enough money, so actually make the purchase
    return await studentPayPurchase({
      account_id,
      project_id: description.project_id,
    });
  }
}

export async function extraInfo(description: Description, account_id?: string) {
  if (description.type != "student-pay") {
    throw Error("description must be of type student-pay");
  }

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT course, title FROM projects WHERE project_id=$1",
    [description.project_id],
  );
  const { course, title = "No Title" } = rows[0] ?? {};
  if (course == null) {
    throw Error("Invalid token -- not a course project.");
  }
  const projectLink = `[${title}](/projects/${description.project_id})`;
  const cost = toDecimal(getCost(course.payInfo));
  if (course.paid || description.paid) {
    // Yeah, it's fully paid!
    return {
      ...description,
      title: "Pay Course Fee",
      details: `The ${moneyToCurrency(cost, 2)} course fee for the project ${projectLink} has already been paid. Thank you!`,
      okText: "",
      cancelText: "Close",
      icon: "graduation-cap",
    };
  }
  if (course.payment_intent_id) {
    // Payment started, but it didn't succeed or finish.  Could have started 1 second ago.
    return {
      ...description,
      title: "Pay Course Fee",
      details: `The ${moneyToCurrency(cost, 2)} course fee for the project ${projectLink} is being processed.

- Refresh this page to see the latest status.

- [Browse all recent payments.](/settings/payments)`,
      okText: "",
      cancelText: "Close",
      icon: "graduation-cap",
    };
  }
  if (!account_id) {
    return {
      ...description,
      title: "Pay Course Fee",
      details: `You must be signed in to pay the course fee for ${await getName(
        course.account_id,
      )}'s project ${projectLink}.  You can be signed in as any user, and it is very easy to make a new account.`,
      signIn: true,
    };
  }

  const balance = toDecimal(await getBalance({ account_id }));
  const balanceAfterPay = balance.sub(cost);
  const { pay_as_you_go_min_payment } = await getServerSettings();
  let due = moneyRound2Up(balanceAfterPay.neg().gt(0) ? balanceAfterPay.neg() : 0);
  let minPayment = "";
  const minPaymentValue = toDecimal(pay_as_you_go_min_payment ?? 0);
  if (due.gt(0) && due.lt(minPaymentValue)) {
    due = minPaymentValue;
    minPayment = `\n\n- There is a minimum transaction amount of ${moneyToCurrency(
      minPaymentValue,
    )}. `;
  }
  const name = await getName(course.account_id);

  const lineItems: LineItem[] = [];
  if (due.gt(0)) {
    lineItems.push({
      description: `Course Fee for project '${title}'`,
      amount: cost.toNumber(),
    });
  }
  const min = (a, b) => (a.lt(b) ? a : b);
  const balanceAmount = min(toDecimal(0), due.sub(cost));
  if (balanceAmount.gt(0)) {
    lineItems.push({
      description: "Apply account balance toward course fee",
      amount: balanceAmount.toNumber(),
    });
  }

  const payment = {
    purpose: STUDENT_PAY,
    metadata: { project_id: description.project_id },
    description: "Pay fee for access to a course.",
    lineItems,
  };

  return {
    ...description,
    due: due.toNumber(),
    title: "Pay Course Fee",
    details: `
- The course fee of ${moneyToCurrency(moneyRound2Up(cost))} ${
      name ? `for ${name}'s ` : " for the "
    } project ${projectLink} has not yet been paid.

${minPayment}
`,
    okText: due.lte(0)
      ? "Purchase With 1-Click Using Account Credit"
      : "Checkout",
    icon: "graduation-cap",

    payment,
  };
}

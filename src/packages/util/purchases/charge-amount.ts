import { round2up } from "@cocalc/util/misc";

export default function getChargeAmount({
  cost,
  balance,
  minBalance,
  minPayment,
}: {
  cost: number;
  balance: number;
  minBalance: number;
  minPayment: number;
}): {
  amountDue: number;
  chargeAmount: number;
  cureAmount: number;
  minimumPaymentCharge: number;
} {
  // Figure out what the amount due is, not worrying about the minPayment (we do that below).
  let amountDue = cost;

  // Sometimes the balance goes below the minimum allowed balance,
  // so if that happens we correct that here.
  const cureAmount = Math.max(minBalance - balance, 0);
  // get back up to the minimum balance:
  amountDue += cureAmount;

  const availableCredit = balance - minBalance + cureAmount;
  const appliedCredit = Math.min(availableCredit, amountDue);
  if (availableCredit > 0) {
    // We extend a little bit of credit to this user, because they
    // have a minBalance below 0:
    amountDue -= appliedCredit;
  }

  const minimumPaymentCharge =
    amountDue > 0 ? Math.max(amountDue, minPayment) - amountDue : 0;

  // amount due can never be negative.
  // We always round up though -- if the user owes us 1.053 cents and we charge 1.05, then
  // they still owe 0.003 and the purchase fails!
  amountDue = Math.max(0, round2up(amountDue));

  // amount you actually have to pay, due to our min payment requirement
  const chargeAmount = amountDue == 0 ? 0 : Math.max(amountDue, minPayment);

  return {
    amountDue,
    chargeAmount,
    cureAmount,
    minimumPaymentCharge,
  };
}

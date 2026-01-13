import { moneyRound2Up, toDecimal, type MoneyValue } from "@cocalc/util/money";

export default function getChargeAmount({
  cost,
  balance,
  minBalance,
  minPayment,
}: {
  cost: MoneyValue;
  balance: MoneyValue;
  minBalance: MoneyValue;
  minPayment: MoneyValue;
}): {
  amountDue: number;
  chargeAmount: number;
  cureAmount: number;
  minimumPaymentCharge: number;
} {
  const costValue = toDecimal(cost);
  const balanceValue = toDecimal(balance);
  const minBalanceValue = toDecimal(minBalance);
  const minPaymentValue = toDecimal(minPayment);
  const max = (a, b) => (a.gt(b) ? a : b);
  const min = (a, b) => (a.lt(b) ? a : b);

  // Figure out what the amount due is, not worrying about the minPayment (we do that below).
  let amountDue = costValue;

  // Sometimes the balance goes below the minimum allowed balance,
  // so if that happens we correct that here.
  const cureAmount = max(minBalanceValue.sub(balanceValue), toDecimal(0));
  // get back up to the minimum balance:
  amountDue = amountDue.add(cureAmount);

  const availableCredit = balanceValue.sub(minBalanceValue).add(cureAmount);
  const appliedCredit = min(availableCredit, amountDue);
  if (availableCredit.gt(0)) {
    // We extend a little bit of credit to this user, because they
    // have a minBalance below 0:
    amountDue = amountDue.sub(appliedCredit);
  }

  const minimumPaymentCharge = amountDue.gt(0)
    ? max(amountDue, minPaymentValue).sub(amountDue)
    : toDecimal(0);

  // amount due can never be negative.
  // We always round up though -- if the user owes us 1.053 cents and we charge 1.05, then
  // they still owe 0.003 and the purchase fails!
  amountDue = moneyRound2Up(max(amountDue, toDecimal(0)));

  // amount you actually have to pay, due to our min payment requirement
  const chargeAmount = amountDue.eq(0)
    ? toDecimal(0)
    : max(amountDue, minPaymentValue);

  return {
    amountDue: amountDue.toNumber(),
    chargeAmount: chargeAmount.toNumber(),
    cureAmount: cureAmount.toNumber(),
    minimumPaymentCharge: minimumPaymentCharge.toNumber(),
  };
}

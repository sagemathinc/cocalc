import Decimal, { type Numeric } from "decimal.js-light";

export type MoneyValue = Numeric;

export function toDecimal(value: MoneyValue): Decimal {
  return new Decimal(value);
}

export function moneyAdd(a: MoneyValue, b: MoneyValue): Decimal {
  return new Decimal(a).add(b);
}

export function moneySubtract(a: MoneyValue, b: MoneyValue): Decimal {
  return new Decimal(a).sub(b);
}

export function moneyMultiply(a: MoneyValue, b: MoneyValue): Decimal {
  return new Decimal(a).mul(b);
}

export function moneyDivide(a: MoneyValue, b: MoneyValue): Decimal {
  return new Decimal(a).div(b);
}

export function moneyCompare(a: MoneyValue, b: MoneyValue): -1 | 0 | 1 {
  return new Decimal(a).comparedTo(b);
}

export function moneyRound2Up(value: MoneyValue): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_CEIL);
}

export function moneyRound2Down(value: MoneyValue): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_FLOOR);
}

export function moneyToStripe(amount: MoneyValue): number {
  return new Decimal(amount)
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_CEIL)
    .toNumber();
}

export function stripeToMoney(amountStripe: MoneyValue): Decimal {
  return new Decimal(amountStripe).div(100);
}

export function moneyToDbString(amount: MoneyValue): string {
  return new Decimal(amount).toFixed(10);
}

function addCommas(value: string): string {
  const [whole, fraction] = value.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (fraction == null) {
    return withCommas;
  }
  return `${withCommas}.${fraction}`;
}

export function moneyToCurrency(amount: MoneyValue, decimals?: number): string {
  const dec = new Decimal(amount);
  if (dec.eq(0)) {
    return "$0.00";
  }
  const abs = dec.abs();
  const dp = decimals ?? (abs.lt("0.0095") ? 3 : 2);
  let s = `$${addCommas(abs.toFixed(dp))}`;
  if (dec.isNegative()) {
    s = `-${s}`;
  }
  if (decimals == null || decimals <= 2) {
    return s;
  }
  const i = s.indexOf(".");
  while (s.endsWith("0") && i >= 0 && i <= s.length - decimals) {
    s = s.slice(0, -1);
  }
  return s;
}

import Decimal, { type Numeric } from "decimal.js-light";
import type { LineItem } from "@cocalc/util/stripe/types";

export function decimalToStripe(amount: Numeric): number {
  return Math.ceil(new Decimal(amount).mul(new Decimal(100)).toNumber());
  // key is do NOT round up after multiplying by 100,
  // e.g., 8.38*100 --> 838.0000000000001
  // return Math.round(round2up(amount) * 100);
}

export function stripeToDecimal(amountStripe: Numeric): number {
  return new Decimal(amountStripe).div(new Decimal(100)).toNumber();
}

export function decimalMultiply(a: Numeric, b: Numeric): number {
  return new Decimal(a).mul(new Decimal(b)).toNumber();
}

export function decimalDivide(a: Numeric, b: Numeric): number {
  return new Decimal(a).div(new Decimal(b)).toNumber();
}

export function decimalSubtract(a: Numeric, b: Numeric): number {
  return new Decimal(a).sub(new Decimal(b)).toNumber();
}

export function decimalAdd(a: Numeric, b: Numeric): number {
  return new Decimal(a).add(new Decimal(b)).toNumber();
}

export function grandTotal(cartItems: LineItem[]): number {
  let t = new Decimal(0);
  for (const { amount } of cartItems) {
    t = t.add(new Decimal(amount));
  }
  return t.toNumber();
}

// // add floats in v as exact decimals
// export function addDecimal(v: number[]): number {
//   let t = new Decimal(0);
//   for (const x of v) {
//     t = t.add(new Decimal(x));
//   }
//   return t.toNumber();
// }

import voucherCodes from "voucher-code-generator";
import type { WhenPay } from "./db-schema/vouchers";
export type { WhenPay };

export const CHARSETS = [
  "numbers",
  "alphabetic",
  "alphanumeric",
  "lower",
  "upper",
];

export type CharSet = (typeof CHARSETS)[number];

export const MAX_VOUCHERS: { [when: string]: number } = {
  now: 5000,
  invoice: 1000,
  admin: 10000,
};

export const MAX_VOUCHER_VALUE = 9999;

interface Options {
  count: number;
  length?: number;
  charset?: CharSet;
  prefix?: string;
  postfix?: string;
}

export default function generateVouchers({
  count,
  length = 8,
  charset: charset0 = "alphanumeric",
  prefix,
  postfix,
}: Options): string[] {
  let charset;
  if (
    charset0 == "numbers" ||
    charset0 == "alphabetic" ||
    charset0 == "alphanumeric"
  ) {
    charset = voucherCodes.charset(charset0);
  } else if (charset0 == "lower") {
    charset = "abcdefghijklmnopqrstuvwxyz";
  } else if (charset0 == "upper") {
    charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  } else {
    charset = charset0;
  }
  return voucherCodes.generate({ length, count, charset, prefix, postfix });
}

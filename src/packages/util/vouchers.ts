import voucherCodes from "voucher-code-generator";

export type CharSet =
  | "numbers"
  | "alphabetic"
  | "alphanumeric"
  | "lower"
  | "upper";

interface Options {
  count: number;
  length?: number;
  charset?: CharSet;
  prefix?: string;
  postfix?: string;
}

export default function vouchers({
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

import { CashVoucher } from "@cocalc/util/db-schema/shopping-cart-items";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import { SiteLicenseDescriptionDB } from "@cocalc/util/upgrades/shopping";
import { currency, plural } from "@cocalc/util/misc";
import type { LineItem } from "@cocalc/util/stripe/types";
import { decimalMultiply } from "@cocalc/util/stripe/calc";

export function toFriendlyDescription(
  description: SiteLicenseDescriptionDB | CashVoucher,
): string {
  switch (description.type) {
    case "quota":
      return describe_quota(description);
    case "cash-voucher":
      // see corresponding react code in next/components/store/site-license-cost.tsx
      return `${description.numVouchers ?? 1} ${plural(description.numVouchers ?? 1, "Voucher Code")} ${description.numVouchers > 1 ? " each " : ""}worth ${currency(description.amount)}. Total Value: ${currency(decimalMultiply(description.amount, description.numVouchers ?? 1))}${description.whenPay == "admin" ? " (admin: no charge)" : ""}`;
      return `${currency((description as CashVoucher).amount)} account credit`;
    default:
      return "Credit account to complete store purchase";
  }
}

export function creditLineItem({
  amount,
  lineItems,
}: {
  amount: number;
  lineItems: LineItem[];
}): { total: number; credit?: LineItem } {
  const amountStripe = Math.ceil(amount * 100);
  let totalStripe = 0;
  for (const lineItem of lineItems) {
    const lineItemAmountStripe = Math.ceil(lineItem.amount * 100);
    totalStripe += lineItemAmountStripe;
  }
  const credit = amountStripe - totalStripe;
  if (credit) {
    return {
      total: totalStripe / 100,
      credit: {
        amount: credit / 100,
        description:
          credit < 0
            ? "Apply credit from your account toward purchase"
            : "CoCalc account credit",
      },
    };
  }
  return { total: totalStripe / 100 };
}

import { CashVoucher } from "@cocalc/util/db-schema/shopping-cart-items";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import { SiteLicenseDescriptionDB } from "@cocalc/util/upgrades/shopping";
import { currency } from "@cocalc/util/misc";
import type { LineItem } from "@cocalc/util/stripe/types";

export function toFriendlyDescription(
  description: SiteLicenseDescriptionDB | CashVoucher,
): string {
  switch (description.type) {
    case "quota":
      return describe_quota(description);
    case "cash-voucher":
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

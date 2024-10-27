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
}): LineItem | undefined {
  const amountStripe = Math.ceil(amount * 100);
  let total = 0;
  for (const lineItem of lineItems) {
    const lineItemAmount = Math.ceil(lineItem.amount * 100);
    total += lineItemAmount;
  }
  const credit = amountStripe - total;
  if (credit) {
    return {
      amount: credit / 100,
      description:
        credit < 0
          ? "Apply existing CoCalc account credit"
          : "Add to CoCalc account credit",
    };
  }
  return undefined;
}

import type { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
import { currency } from "@cocalc/util/misc";
import { moneyRound2Up } from "@cocalc/util/money";
import { compute_cost } from "@cocalc/util/purchases/quota/compute-cost";

export function getCost(purchaseInfo?: PurchaseInfo): number {
  if (purchaseInfo == null) {
    // old projects or where course doesn't have a "payInfo" field.
    return 0;
  }
  const { cost } = purchaseInfo;
  if (cost == null) {
    return moneyRound2Up(compute_cost(purchaseInfo).cost).toNumber();
  }
  if (typeof cost == "number") {
    // should never happen
    return moneyRound2Up(cost).toNumber();
  }
  return moneyRound2Up(cost.cost).toNumber();
}

export default function Cost({ purchaseInfo }: { purchaseInfo: PurchaseInfo }) {
  return <>{currency(moneyRound2Up(getCost(purchaseInfo)).toNumber())}</>;
}

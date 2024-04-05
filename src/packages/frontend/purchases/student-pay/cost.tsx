import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { currency, round2up } from "@cocalc/util/misc";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";

export function getCost(purchaseInfo: PurchaseInfo): number {
  const { cost } = purchaseInfo;
  if (cost == null) {
    return round2up(compute_cost(purchaseInfo).discounted_cost);
  }
  if (typeof cost == "number") {
    // should never happen
    return round2up(cost);
  }
  return round2up(cost.discounted_cost);
}

export default function Cost({ purchaseInfo }: { purchaseInfo: PurchaseInfo }) {
  return <>{currency(round2up(getCost(purchaseInfo)))}</>;
}

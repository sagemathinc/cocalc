import dayjs from "dayjs";

import { getTransactionClient, PoolClient } from "@cocalc/database/pool";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import {
  computeMembershipChange,
  MembershipChangeResult,
} from "@cocalc/server/membership/tiers";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import createSubscription from "@cocalc/server/purchases/create-subscription";
import { MembershipClass } from "@cocalc/conat/hub/api/purchases";
import { toDecimal } from "@cocalc/util/money";

interface MembershipChangeOptions {
  account_id: string;
  targetClass: MembershipClass;
  interval: "month" | "year";
  allowDowngrade?: boolean;
  storeVisibleOnly?: boolean;
  requireNoPayment?: boolean;
  client?: PoolClient;
}

export async function applyMembershipChange({
  account_id,
  targetClass,
  interval,
  allowDowngrade = false,
  storeVisibleOnly = false,
  requireNoPayment = false,
  client,
}: MembershipChangeOptions): Promise<
  MembershipChangeResult & { subscription_id: number; purchase_id: number }
> {
  const transaction = client ?? (await getTransactionClient());
  const useTransaction = client == null;
  try {
    const change = await computeMembershipChange({
      account_id,
      targetClass,
      interval,
      allowDowngrade,
      storeVisibleOnly,
      client: transaction,
    });
    const chargeValue = toDecimal(change.charge);

    if (requireNoPayment && chargeValue.gt(0)) {
      const purchase = await isPurchaseAllowed({
        account_id,
        service: "membership",
        cost: chargeValue,
        client: transaction,
      });
      const chargeAmount = toDecimal(purchase.chargeAmount ?? change.charge);
      if (!purchase.allowed) {
        throw Error(purchase.reason ?? "purchase not allowed");
      }
      if (chargeAmount.gt(0)) {
        throw Error("payment required");
      }
    }

    if (change.existing_subscription_id) {
      await transaction.query(
        "UPDATE subscriptions SET status='canceled', canceled_at=NOW(), canceled_reason=$1 WHERE id=$2",
        [
          `Changed membership to ${targetClass}`,
          change.existing_subscription_id,
        ],
      );
    }

    const start = dayjs().toDate();
    const existingEnd = change.current_period_end;
    const end =
      change.change == "downgrade" &&
      existingEnd != null &&
      existingEnd > start
        ? existingEnd
        : interval == "month"
          ? dayjs(start).add(1, "month").toDate()
          : dayjs(start).add(1, "year").toDate();

    const subscription_id = await createSubscription(
      {
        account_id,
        cost: change.price,
        interval,
        current_period_start: start,
        current_period_end: end,
        latest_purchase_id: 0,
        status: "active",
        metadata: { type: "membership", class: targetClass },
      },
      transaction,
    );

    const purchase_id = await createPurchase({
      account_id,
      cost: chargeValue,
      unrounded_cost: chargeValue,
      service: "membership",
      description: {
        type: "membership",
        subscription_id,
        class: targetClass,
        interval,
      },
      tag: "membership-change",
      period_start: start,
      period_end: end,
      client: transaction,
    });

    await transaction.query(
      "UPDATE subscriptions SET latest_purchase_id=$1 WHERE id=$2",
      [purchase_id, subscription_id],
    );

    if (useTransaction) {
      await transaction.query("COMMIT");
    }

    return { ...change, subscription_id, purchase_id };
  } catch (err) {
    if (useTransaction) {
      await transaction.query("ROLLBACK");
    }
    throw err;
  } finally {
    if (useTransaction) {
      transaction.release();
    }
  }
}

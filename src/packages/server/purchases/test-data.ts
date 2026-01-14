import dayjs from "dayjs";
import createAccount from "@cocalc/server/accounts/create-account";
import createSubscription from "./create-subscription";
import { uuid } from "@cocalc/util/misc";
import type { MembershipClass } from "@cocalc/util/db-schema/subscriptions";

export async function createTestAccount(account_id: string) {
  await createAccount({
    email: `${uuid()}@test.com`,
    password: "cocalcrulez",
    firstName: "Test",
    lastName: "User",
    account_id,
  });
}

export async function createTestMembershipSubscription(
  account_id: string,
  opts?: {
    class?: MembershipClass;
    interval?: "month" | "year";
    start?: Date;
    end?: Date;
    cost?: number;
    status?: "active" | "canceled" | "unpaid" | "past_due";
  },
) {
  const now = dayjs();
  const interval = opts?.interval ?? "month";
  const start = opts?.start ?? now.toDate();
  const end =
    opts?.end ??
    (interval == "month" ? now.add(1, "month") : now.add(1, "year")).toDate();
  const cost = opts?.cost ?? 10;
  const status = opts?.status ?? "active";
  const membershipClass = opts?.class ?? "member";
  const subscription_id = await createSubscription(
    {
      account_id,
      cost,
      interval,
      current_period_start: start,
      current_period_end: end,
      status,
      metadata: { type: "membership", class: membershipClass },
      latest_purchase_id: 0,
    },
    null,
  );
  return { subscription_id, cost, start, end, membershipClass, interval };
}

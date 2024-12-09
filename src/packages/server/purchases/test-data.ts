import dayjs from "dayjs";
import createAccount from "@cocalc/server/accounts/create-account";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import createSubscription from "./create-subscription";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import { uuid } from "@cocalc/util/misc";

// This license is a little unusual because it starts a week from now and ends a
// month from now.
export const license0 = {
  cpu: 1,
  ram: 2,
  disk: 3,
  type: "quota",
  user: "academic",
  boost: true,
  range: [
    dayjs().add(1, "week").toISOString(),
    dayjs().add(1, "month").toISOString(),
  ],
  title: "as",
  member: true,
  period: "range",
  uptime: "short",
  run_limit: 1,
  description: "xxxx",
} as const;

const license1 = {
  ...license0,
  range: undefined,
  period: "monthly",
} as const;

export async function createTestAccount(account_id: string) {
  await createAccount({
    email: `${uuid()}@test.com`,
    password: "cocalcrulez",
    firstName: "Test",
    lastName: "User",
    account_id,
    // important -- otherwise every time we call createTestAccount, a project gets created and is running,
    // and these do NOT get cleaned up ever.
    noFirstProject: true,
  });
}

export async function createTestSubscription(account_id: string) {
  const cost = 10; // cost is technically arbitrary and not related to actual cost of prorated license so making this up should be fine.
  const info = getPurchaseInfo(license1);
  if (info.type != "quota") {
    throw Error("bug");
  }
  const license_id = await createLicense(account_id, info);
  const subscription_id = await createSubscription(
    {
      account_id,
      cost,
      interval: "month",
      current_period_start: info.start!,
      current_period_end: info.end!,
      status: "active",
      metadata: { type: "license", license_id },
      latest_purchase_id: 0,
    },
    null,
  );
  return { license_id, subscription_id, cost };
}

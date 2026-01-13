import getBalance from "@cocalc/server/purchases/get-balance";
import getMinBalance0 from "@cocalc/server/purchases/get-min-balance";
import { resolveMembershipForAccount } from "@cocalc/server/membership/resolve";
import { getLLMUsageStatus } from "@cocalc/server/llm/usage-status";
import type { MoneyValue } from "@cocalc/util/money";

export { getBalance };

export async function getMinBalance({
  account_id,
}: {
  account_id: string;
}): Promise<MoneyValue> {
  return await getMinBalance0(account_id);
}

export async function getMembership({ account_id }) {
  return await resolveMembershipForAccount(account_id);
}

export async function getLLMUsage({ account_id }) {
  return await getLLMUsageStatus({ account_id });
}

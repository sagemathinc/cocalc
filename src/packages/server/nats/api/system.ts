import getCustomize from "@cocalc/database/settings/customize";
export { getCustomize };
import { addProjectPermission } from "@cocalc/server/nats/auth";
export { addProjectPermission };
import { record_user_tracking } from "@cocalc/database/postgres/user-tracking";
import { db } from "@cocalc/database";

export function ping() {
  return { now: Date.now() };
}

export async function terminate() {}

export async function userTracking({
  event,
  value,
  account_id,
}: {
  event: string;
  value: object;
  account_id?: string;
}): Promise<void> {
  await record_user_tracking(db(), account_id!, event, value);
}


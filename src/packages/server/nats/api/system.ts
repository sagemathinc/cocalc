import getCustomize from "@cocalc/database/settings/customize";
export { getCustomize };
import { addProjectPermission } from "@cocalc/server/nats/auth";
export { addProjectPermission };

export function ping() {
  return { now: Date.now() };
}

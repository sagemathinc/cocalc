import TTL from "@isaacs/ttlcache";
import getLogger from "@cocalc/backend/logger";
import callHub from "@cocalc/conat/hub/call-hub";
import { getMasterConatClient } from "./master-status";
import { getLocalHostId } from "./sqlite/hosts";

const logger = getLogger("project-host:last-edited");
const TOUCH_TTL_MS = 30_000;
const touchCache = new TTL<string, true>({ ttl: TOUCH_TTL_MS });

export async function touchProjectLastEdited(
  project_id: string,
  reason?: string,
): Promise<void> {
  if (touchCache.has(project_id)) {
    return;
  }
  touchCache.set(project_id, true);
  const client = getMasterConatClient();
  const host_id = getLocalHostId();
  if (!client || !host_id) {
    logger.debug("touchProjectLastEdited skipped (missing client/host)", {
      project_id,
      reason,
    });
    return;
  }
  try {
    await callHub({
      client,
      host_id,
      name: "hosts.touchProject",
      args: [{ project_id }],
      timeout: 5000,
    });
  } catch (err) {
    logger.debug("touchProjectLastEdited failed", {
      project_id,
      reason,
      err: `${err}`,
    });
  }
}

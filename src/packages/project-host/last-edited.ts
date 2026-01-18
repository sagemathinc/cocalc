import TTL from "@isaacs/ttlcache";
import getLogger from "@cocalc/backend/logger";
import callHub from "@cocalc/conat/hub/call-hub";
import { getMasterConatClient } from "./master-status";
import { getLocalHostId } from "./sqlite/hosts";

const logger = getLogger("project-host:last-edited");
const TOUCH_TTL_MS = 30_000;
const RUNNING_TOUCH_TTL_MS = 5 * 60_000;
const touchCache = new TTL<string, true>({ ttl: TOUCH_TTL_MS });
const runningTouchCache = new TTL<string, true>({ ttl: RUNNING_TOUCH_TTL_MS });
const runningGeneration = new Map<string, number>();

export async function touchProjectLastEdited(
  project_id: string,
  reason?: string,
  opts?: { force?: boolean },
): Promise<void> {
  if (!opts?.force && touchCache.has(project_id)) {
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

export async function touchProjectLastEditedRunning(
  project_id: string,
  generation: number,
  reason = "running",
  opts?: { force?: boolean },
): Promise<void> {
  if (!Number.isFinite(generation)) {
    return;
  }
  if (!opts?.force && runningTouchCache.has(project_id)) {
    return;
  }
  runningTouchCache.set(project_id, true);
  const previous = runningGeneration.get(project_id);
  runningGeneration.set(project_id, generation);
  if (previous == null) {
    logger.debug("running generation baseline", { project_id, generation });
    return;
  }
  if (generation <= previous) {
    logger.debug("running generation unchanged", { project_id, generation });
    return;
  }
  logger.debug("running generation updated", {
    project_id,
    previous,
    generation,
    delta: generation - previous,
  });
  await touchProjectLastEdited(project_id, reason, { force: opts?.force });
}

export function shouldCheckProjectLastEditedRunning(project_id: string): boolean {
  return !runningTouchCache.has(project_id);
}

export function resetProjectLastEditedRunning(project_id: string): void {
  runningTouchCache.delete(project_id);
  runningGeneration.delete(project_id);
}

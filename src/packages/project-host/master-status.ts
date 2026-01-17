// Handles reporting project state from a project-host to the master. We send
// state updates immediately on change, mark them as reported when the master
// confirms, and retry every 15s for any states that have not been reported
// (covers outages or restarts). This keeps the master view in sync even if
// connectivity is intermittent.
import type { Client } from "@cocalc/conat/core/client";
import getLogger from "@cocalc/backend/logger";
import {
  createHostStatusClient,
  type HostStatusApi,
  type HostProjectStatus,
} from "@cocalc/conat/project-host/api";
import {
  listUnreportedProjects,
  markProjectStateReported,
} from "./sqlite/projects";
import {
  listUnreportedProvisioning,
  markProjectProvisionedReported,
  setProjectProvisioned,
} from "./sqlite/provisioning";
import { deleteProjectLocal } from "./sqlite/projects";

let statusClient: HostStatusApi | undefined;
let hostInfo: Pick<HostProjectStatus, "host_id" | "host"> | undefined;
const logger = getLogger("project-host:master-status");
let resendTimer: NodeJS.Timeout | undefined;
let masterClient: Client | undefined;
let pendingInventory:
  | { project_ids: string[]; checked_at: number }
  | null = null;

export function setMasterStatusClient({
  client,
  host_id,
  host,
}: {
  client: Client;
  host_id: string;
  host?: HostProjectStatus["host"];
}) {
  statusClient = createHostStatusClient({ client });
  masterClient = client;
  hostInfo = { host_id, host };
  reportPendingStates().catch((err) =>
    logger.debug("reportPendingStates initial send failed", { err }),
  );
  if (!resendTimer) {
    resendTimer = setInterval(reportPendingStates, 15_000).unref();
  }
}

export function getMasterConatClient(): Client | undefined {
  return masterClient;
}

export async function reportProjectStateToMaster(
  project_id: string,
  state: HostProjectStatus["state"],
) {
  if (!statusClient || !hostInfo) return;
  try {
    logger.debug("reportProjectStateToMaster", { project_id, state });
    const res = await statusClient.reportProjectState({
      ...hostInfo,
      project_id,
      state,
    });
    if ((res as any)?.action === "delete") {
      logger.debug("master requested local project deletion", { project_id });
      deleteProjectLocal(project_id);
      return;
    }
    markProjectStateReported(project_id);
  } catch (err) {
    logger.debug("reportProjectStateToMaster failed", { project_id, err });
  }
}

export function queueProvisionedInventory(project_ids: string[]) {
  const checked_at = Date.now();
  pendingInventory = { project_ids, checked_at };
  reportProvisionedInventory().catch((err) =>
    logger.debug("reportProvisionedInventory failed", { err }),
  );
}

async function reportProvisionedInventory() {
  if (!statusClient || !hostInfo || !pendingInventory) return;
  const payload = pendingInventory;
  try {
    logger.debug("reportHostProvisionedInventory", {
      count: payload.project_ids.length,
    });
    await statusClient.reportHostProvisionedInventory({
      ...hostInfo,
      project_ids: payload.project_ids,
      checked_at: payload.checked_at,
    });
    pendingInventory = null;
  } catch (err) {
    logger.debug("reportHostProvisionedInventory failed", { err });
  }
}

export function queueProjectProvisioned(
  project_id: string,
  provisioned: boolean,
) {
  setProjectProvisioned(project_id, provisioned);
  reportProjectProvisionedToMaster(project_id, provisioned).catch((err) =>
    logger.debug("reportProjectProvisionedToMaster failed", {
      project_id,
      provisioned,
      err,
    }),
  );
}

async function reportProjectProvisionedToMaster(
  project_id: string,
  provisioned: boolean,
) {
  if (!statusClient || !hostInfo) return;
  try {
    logger.debug("reportProjectProvisionedToMaster", {
      project_id,
      provisioned,
    });
    const res = await statusClient.reportProjectProvisioned({
      ...hostInfo,
      project_id,
      provisioned,
    });
    if ((res as any)?.action === "delete") {
      logger.debug("master requested local project deletion", { project_id });
      deleteProjectLocal(project_id);
      return;
    }
    markProjectProvisionedReported(project_id);
  } catch (err) {
    logger.debug("reportProjectProvisionedToMaster failed", {
      project_id,
      provisioned,
      err,
    });
  }
}

async function reportPendingStates() {
  if (!statusClient || !hostInfo) return;
  const pending = listUnreportedProjects();
  for (const row of pending) {
    if (!row.state) continue;
    try {
      const res = await statusClient.reportProjectState({
        ...hostInfo,
        project_id: row.project_id,
        state: row.state,
      });
      if ((res as any)?.action === "delete") {
        logger.debug("master requested local project deletion", {
          project_id: row.project_id,
        });
        deleteProjectLocal(row.project_id);
        continue;
      }
      markProjectStateReported(row.project_id);
    } catch (err) {
      logger.debug("reportPendingStates failed", {
        project_id: row.project_id,
        err,
      });
    }
  }
  await reportPendingProvisioning();
}

async function reportPendingProvisioning() {
  if (!statusClient || !hostInfo) return;
  const pending = listUnreportedProvisioning();
  for (const row of pending) {
    try {
      const res = await statusClient.reportProjectProvisioned({
        ...hostInfo,
        project_id: row.project_id,
        provisioned: row.provisioned,
      });
      if ((res as any)?.action === "delete") {
        logger.debug("master requested local project deletion", {
          project_id: row.project_id,
        });
        deleteProjectLocal(row.project_id);
        continue;
      }
      markProjectProvisionedReported(row.project_id);
    } catch (err) {
      logger.debug("reportPendingProvisioning failed", {
        project_id: row.project_id,
        err,
      });
    }
  }
  await reportProvisionedInventory();
}

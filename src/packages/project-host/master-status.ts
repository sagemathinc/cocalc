import type { Client } from "@cocalc/conat/core/client";
import getLogger from "@cocalc/backend/logger";
import {
  createHostStatusClient,
  type HostStatusApi,
  type HostProjectStatus,
} from "@cocalc/conat/project-host/api";

let statusClient: HostStatusApi | undefined;
let hostInfo: Pick<HostProjectStatus, "host_id" | "host"> | undefined;
const logger = getLogger("project-host:master-status");

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
  hostInfo = { host_id, host };
}

export async function reportProjectStateToMaster(
  project_id: string,
  state: HostProjectStatus["state"],
) {
  if (!statusClient || !hostInfo) return;
  try {
    logger.debug("reportProjectStateToMaster", { project_id, state });
    await statusClient.reportProjectState({
      ...hostInfo,
      project_id,
      state,
    });
  } catch (err) {
    logger.debug("reportProjectStateToMaster failed", { project_id, err });
  }
}

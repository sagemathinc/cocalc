/*
Broadcast project status whenever it updates.
*/

import { projectSubject } from "@cocalc/conat/names";
import { conat } from "@cocalc/conat/client";
import { getLogger } from "@cocalc/conat/client";
import { type Subscription } from "@cocalc/conat/core/client";

const SERVICE_NAME = "project-status";
const logger = getLogger("project:project-status");

function getSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: SERVICE_NAME,
  });
}

// publishes status updates when they are emitted.
export async function createPublisher({
  client = conat(),
  project_id,
  compute_server_id,
  projectStatusServer,
}) {
  const subject = getSubject({ project_id, compute_server_id });
  logger.debug("publishing status updates on ", { subject });
  projectStatusServer.on("status", (status) => {
    logger.debug("publishing updated status", status);
    client.publishSync(subject, status);
  });
}

// async iterator over the status updates:
export async function get({
  client = conat(),
  project_id,
  compute_server_id,
}): Promise<Subscription> {
  const subject = getSubject({ project_id, compute_server_id });
  return await client.subscribe(subject);
}

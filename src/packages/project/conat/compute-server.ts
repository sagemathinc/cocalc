/*
Act as a compute server.
*/

import { connectToConat } from "./connection";
import { getLogger } from "@cocalc/project/logger";
import startProjectServices from "./index";
import { once } from "@cocalc/util/async-utils";
import { localPathFileserver } from "@cocalc/backend/conat/files/local-path";
import { getService as getFileserverService } from "@cocalc/conat/files/fs";

const logger = getLogger("project:conat:compute");

export async function init({
  apiKey,
  compute_server_id,
  address,
  path = process.env.HOME,
}: {
  apiKey: string;
  compute_server_id: number;
  address: string;
  path?: string;
}) {
  logger.debug("computeServer: ", { apiKey, compute_server_id, address });
  const client = connectToConat({ apiKey, address });
  if (client.info == null) {
    await once(client, "info");
  }
  const project_id = client.info?.user?.project_id;
  logger.debug({ project_id });
  if (!project_id) {
    throw Error("project_id must be set after sign in");
  }

  logger.debug("start fs service");
  localPathFileserver({
    client,
    path,
    service: getFileserverService({ compute_server_id }),
    project_id,
    unsafeMode: true,
  });

  await startProjectServices({ project_id, compute_server_id, client });

  initSyncDoc({ client });

  return client;
}

import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";

function initSyncDoc({ client }) {
  console.log("initSyncDoc -- listening", client != null);
  SyncDoc.events.on("new", (doc) => {
    console.log("created a new sync doc", doc.path);
  });
}

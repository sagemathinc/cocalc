/*
Act as a compute server.
*/

import { connectToConat } from "./connection";
import { getLogger } from "@cocalc/project/logger";

const logger = getLogger("project:conat:compute");

export async function computeServer({
  apiKey,
  compute_server_id,
  address,
}: {
  apiKey: string;
  compute_server_id: number;
  address: string;
}) {
  logger.debug("computeServer: ", { apiKey, compute_server_id, address });
  const client = connectToConat({ apiKey, address });
  return client;
}

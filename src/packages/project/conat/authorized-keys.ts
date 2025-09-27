import { hubApi } from "./hub";
import { getIdentity } from "./connection";
import { updateAuthorizedKeys } from "@cocalc/backend/ssh/authorized-keys";
import { join } from "node:path";
import { getLogger } from "@cocalc/project/logger";

const logger = getLogger("conat:authorized-keys");
export async function update(opts?) {
  logger.debug("update");
  const { client } = getIdentity(opts);
  const api = hubApi(client);
  const keys = await api.projects.getSshKeys();
  logger.debug("got keys", keys);
  const path = join(process.env.HOME ?? "", ".ssh", "authorized_keys");
  const value = await updateAuthorizedKeys({ path, keys });
  logger.debug("updated authorized_keys files", { path });
  return value;
}

import { hubApi } from "./hub";
import { getIdentity } from "./connection";
import { updateAuthorizedKeys } from "@cocalc/backend/ssh/authorized-keys";
import { join } from "node:path";
import { getLogger } from "@cocalc/project/logger";
import { delay } from "awaiting";

const logger = getLogger("conat:authorized-keys");
export async function update(opts?) {
  logger.debug("update");
  const { client } = getIdentity(opts);
  const api = hubApi(client);
  let keys;
  try {
    keys = await api.projects.getSshKeys();
  } catch  {
    // this happens right at startup with cocalc-lite
    await delay(3000);
    keys = await api.projects.getSshKeys();
  }
  logger.debug("got keys", keys);
  const path = join(process.env.HOME ?? "", ".ssh", "authorized_keys");
  const value = await updateAuthorizedKeys({ path, keys });
  logger.debug("updated authorized_keys files", { path });
  return value;
}

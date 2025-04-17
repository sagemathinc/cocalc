import { join } from "path";
import {
  nats,
  natsPorts,
  natsServer,
  natsPassword,
} from "@cocalc/backend/data";
import { readFile } from "node:fs/promises";
import getLogger from "@cocalc/backend/logger";
import { getEnv } from "./env";
export { getEnv };
import { inboxPrefix } from "@cocalc/nats/names";
import { setNatsClient } from "@cocalc/nats/client";
import getConnection, {
  setConnectionOptions,
} from "@cocalc/backend/nats/persistent-connection";

export { getConnection };

export function init() {
  setNatsClient({ getNatsEnv: getEnv });
}
init();

const logger = getLogger("backend:nats");

export async function getCreds(): Promise<string | undefined> {
  const filename = join(nats, "nsc/keys/creds/cocalc/cocalc/cocalc.creds");
  try {
    return (await readFile(filename)).toString().trim();
  } catch {
    logger.debug(
      `getCreds -- please create ${filename}, which is missing.  Nothing will work.`,
    );
    return undefined;
  }
}

setConnectionOptions(async () => {
  const servers = `${natsServer}:${natsPorts.server}`;
  return {
    user: "cocalc",
    pass: natsPassword,
    inboxPrefix: inboxPrefix({}),
    servers,
  };
});

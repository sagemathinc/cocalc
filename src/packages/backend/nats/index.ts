import { join } from "path";
import { nats } from "@cocalc/backend/data";
import { readFile } from "node:fs/promises";
import getLogger from "@cocalc/backend/logger";
import { connect, credsAuthenticator } from "nats";

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

let nc: Awaited<ReturnType<typeof connect>> | null = null;
export async function getConnection() {
  logger.debug("connecting to nats");

  if (nc == null) {
    const creds = await getCreds();
    nc = await connect({
      authenticator: credsAuthenticator(new TextEncoder().encode(creds)),
      // bound on how long after network or server goes down until starts working again
      pingInterval: 10000,
    });
    logger.debug(`connected to ${nc.getServer()}`);
  }
  return nc;
}

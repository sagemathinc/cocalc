import { join } from "path";
import { secrets } from "@cocalc/backend/data";
import { readFile } from "node:fs/promises";
import getLogger from "@cocalc/backend/logger";
import { connect, credsAuthenticator } from "nats";

const logger = getLogger("backend:nats");

export async function getCreds(): Promise<string | undefined> {
  const filename = join(secrets, "nats.creds");
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
    });
    logger.debug(`connected to ${nc.getServer()}`);
  }
  return nc;
}

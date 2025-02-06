import { join } from "path";
import { nats } from "@cocalc/backend/data";
import { readFile } from "node:fs/promises";
import getLogger from "@cocalc/backend/logger";
import { connect, credsAuthenticator } from "nats";
export { getEnv } from "./env";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";

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

let wait = 2000;
let nc: Awaited<ReturnType<typeof connect>> | null = null;
export const getConnection = reuseInFlight(async () => {
  logger.debug("connecting to nats");

  while (nc == null) {
    try {
      const creds = await getCreds();
      nc = await connect({
        ...CONNECT_OPTIONS,
        authenticator: credsAuthenticator(new TextEncoder().encode(creds)),
      });
      logger.debug(`connected to ${nc.getServer()}`);
    } catch (err) {
      logger.debug(`WARNING/ERROR: FAILED TO CONNECT TO nats-server: ${err}`);
      logger.debug(`will retry in ${wait} ms`);
      await delay(wait);
      wait = Math.min(7500, 1.25 * wait);
    }
  }
  return nc;
});

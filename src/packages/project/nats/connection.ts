import { getLogger } from "@cocalc/project/logger";
import { connect, jwtAuthenticator } from "nats";
import { natsPorts, natsServer } from "@cocalc/backend/data";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";
import { inboxPrefix as getInboxPrefix } from "@cocalc/nats/names";
import { project_id } from "@cocalc/project/data";
import { delay } from "awaiting";

const logger = getLogger("project:nats:connection");

let COCALC_NATS_JWT = "";

let nc: Awaited<ReturnType<typeof connect>> | null = null;
export default async function getConnection() {
  if (nc == null || (nc as any).protocol?.isClosed?.()) {
    if (!COCALC_NATS_JWT) {
      COCALC_NATS_JWT = process.env.COCALC_NATS_JWT ?? "";
      delete process.env.COCALC_NATS_JWT;
    }
    // for security reasons we delete this the moment we grab it.
    nc = null;
    logger.debug("initializing nats cocalc project connection");
    if (!COCALC_NATS_JWT) {
      throw Error("environment variable COCALC_NATS_JWT *must* be set");
    }
    const inboxPrefix = getInboxPrefix({ project_id });
    logger.debug("Using ", { inboxPrefix });
    let d = 3000;
    const servers = `${natsServer}:${natsPorts.server}`;
    while (nc == null) {
      try {
        nc = await connect({
          ...CONNECT_OPTIONS,
          authenticator: jwtAuthenticator(COCALC_NATS_JWT),
          inboxPrefix,
          servers,
        });
        logger.debug(`connected to ${nc.getServer()}`);
      } catch (err) {
        d = Math.min(15000, d * 1.2) + Math.random();
        logger.debug(
          `ERROR connecting to ${JSON.stringify(servers)}; will retry in ${d}ms.  err=${err}`,
        );
        await delay(d);
      }
    }
  }
  return nc!;
}

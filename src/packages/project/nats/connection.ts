import { getLogger } from "@cocalc/project/logger";
import { connect } from "nats";
import { natsPorts, natsServer } from "@cocalc/backend/data";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";
import { inboxPrefix as getInboxPrefix } from "@cocalc/nats/names";
import { project_id } from "@cocalc/project/data";
import { delay } from "awaiting";
import secretToken from "@cocalc/project/servers/secret-token";

const logger = getLogger("project:nats:connection");

let nc: Awaited<ReturnType<typeof connect>> | null = null;
export default async function getConnection() {
  if (nc == null || (nc as any).protocol?.isClosed?.()) {
    // for security reasons we delete this the moment we grab it.
    nc = null;
    logger.debug("initializing nats cocalc project connection");
    const inboxPrefix = getInboxPrefix({ project_id });
    logger.debug("Using ", { inboxPrefix });
    let d = 3000;
    const servers = `${natsServer}:${natsPorts.server}`;
    while (nc == null) {
      try {
        nc = await connect({
          ...CONNECT_OPTIONS,
          inboxPrefix,
          servers,
          name: JSON.stringify({ project_id }),
          user: `project-${project_id}`,
          token: process.env.API_KEY
            ? process.env.API_KEY
            : await secretToken(),
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

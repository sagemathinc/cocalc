import { getLogger } from "@cocalc/project/logger";
import { connect, jwtAuthenticator } from "nats";
import { CONNECT_OPTIONS } from "@cocalc/util/nats";
import { inboxPrefix as getInboxPrefix } from "@cocalc/nats/names";
import { project_id } from "@cocalc/project/data";

const logger = getLogger("project:nats:connection");

let nc: Awaited<ReturnType<typeof connect>> | null = null;
export default async function getConnection() {
  if (nc == null || (nc as any).protocol?.isClosed?.()) {
    logger.debug("initializing nats cocalc project connection");
    if (!process.env.COCALC_NATS_JWT) {
      throw Error("environment variable COCALC_NATS_JWT *must* be set");
    }
    const inboxPrefix = getInboxPrefix({ project_id });
    logger.debug("Using ", { inboxPrefix });
    nc = await connect({
      ...CONNECT_OPTIONS,
      authenticator: jwtAuthenticator(process.env.COCALC_NATS_JWT),
      inboxPrefix,
    });
    logger.debug(`connected to ${nc.getServer()}`);
  }
  return nc!;
}

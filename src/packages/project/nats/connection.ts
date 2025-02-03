import { getLogger } from "@cocalc/project/logger";
import { connect, jwtAuthenticator } from "nats";

const logger = getLogger("project:nats:connection");

let nc: Awaited<ReturnType<typeof connect>> | null = null;
export default async function getConnection() {
  if (nc == null || (nc as any).protocol?.isClosed?.()) {
    logger.debug("initializing nats cocalc project connection");
    if (!process.env.COCALC_NATS_JWT) {
      throw Error("environment variable COCALC_NATS_JWT *must* be set");
    }
    nc = await connect({
      authenticator: jwtAuthenticator(process.env.COCALC_NATS_JWT),
    });
    logger.debug(`connected to ${nc.getServer()}`);
  }
  return nc!;
}

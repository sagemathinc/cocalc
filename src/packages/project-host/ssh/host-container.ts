import getLogger from "@cocalc/backend/logger";
import {
  start as startProxyContainer,
  getPorts,
} from "@cocalc/project-proxy/container";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { secrets } from "@cocalc/backend/data";
import { join } from "node:path";

const logger = getLogger("project-host:ssh:host-container");

const HOST_VOLUME = "project-host-root";

// Start (or reuse) a dedicated container that exposes SSH access to the
// entire project storage root. The publicKey should be the sshpiperd key so
// the proxy can connect to this container once user auth succeeds.
export const ensureHostContainer = reuseInFlight(
  async ({ path, publicKey }: { path: string; publicKey: string }) => {
    logger.debug("ensureHostContainer", { path });
    const configRoot = join(secrets, "host-ssh", HOST_VOLUME);
    const ports = await startProxyContainer({
      volume: HOST_VOLUME,
      path,
      configRoot,
      publicKey,
      authorizedKeys: publicKey,
    });
    return ports;
  },
);

export const getHostContainerPorts = reuseInFlight(async () => {
  return await getPorts({ volume: HOST_VOLUME });
});

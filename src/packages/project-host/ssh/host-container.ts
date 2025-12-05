import getLogger from "@cocalc/backend/logger";
import { start as startProxyContainer, getPorts } from "@cocalc/project-proxy/container";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const logger = getLogger("project-host:ssh:host-container");

const HOST_VOLUME = "project-host-root";

// Start (or reuse) a dedicated container that exposes SSH access to the
// entire project storage root. The publicKey should be the sshpiperd key so
// the proxy can connect to this container once user auth succeeds.
export const ensureHostContainer = reuseInFlight(
  async ({
    path,
    publicKey,
  }: {
    path: string;
    publicKey: string;
  }) => {
    logger.debug("ensureHostContainer", { path });
    const ports = await startProxyContainer({
      volume: HOST_VOLUME,
      path,
      publicKey,
      authorizedKeys: publicKey,
      // modest defaults; this container only serves rsync/reflect-sync style tasks
      pids: 256,
      memory: "2048m",
      cpu: "2000m",
      lockdown: true,
    });
    return ports;
  },
);

export const getHostContainerPorts = reuseInFlight(async () => {
  return await getPorts({ volume: HOST_VOLUME });
});

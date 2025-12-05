import getLogger from "@cocalc/backend/logger";
import {
  start as startProxyContainer,
  getPorts,
} from "@cocalc/project-proxy/container";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { secrets } from "@cocalc/backend/data";
import { join } from "node:path";
import { getRow } from "@cocalc/lite/hub/sqlite/database";

const logger = getLogger("project-host:ssh:host-container");

function hostVolume(): string {
  const hostId =
    (getRow("project-host", "host-id") as { hostId?: string } | undefined)
      ?.hostId;
  // keep volume/container names short to satisfy hostname limits
  return hostId ? `ph-${hostId}` : "ph-default";
}

// Start (or reuse) a dedicated container that exposes SSH access to the
// entire project storage root. The publicKey should be the sshpiperd key so
// the proxy can connect to this container once user auth succeeds.
export const ensureHostContainer = reuseInFlight(
  async ({ path, publicKey }: { path: string; publicKey: string }) => {
    const volume = hostVolume();
    logger.debug("ensureHostContainer", { path, volume });
    const configRoot = join(secrets, "host-ssh", volume);
    const ports = await startProxyContainer({
      volume,
      path,
      configRoot,
      publicKey,
      authorizedKeys: publicKey,
    });
    return ports;
  },
);

export const getHostContainerPorts = reuseInFlight(async () => {
  return await getPorts({ volume: hostVolume() });
});

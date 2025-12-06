import getLogger from "@cocalc/backend/logger";
import {
  start as startProxyContainer,
  getPorts,
} from "@cocalc/project-proxy/container";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { secrets } from "@cocalc/backend/data";
import { join } from "node:path";
import { getLocalHostId } from "../sqlite/hosts";

const logger = getLogger("project-host:ssh:btrfs-container");

function btrfsVolume(): string {
  const hostId = getLocalHostId();
  // keep names short to satisfy hostname limits
  return hostId ? `btrfs-${hostId}` : "btrfs-default";
}

export const ensureBtrfsContainer = reuseInFlight(
  async ({
    path,
    publicKey,
  }: {
    path: string;
    publicKey: string;
  }) => {
    const volume = btrfsVolume();
    logger.debug("ensureBtrfsContainer", { path, volume });
    const configRoot = join(secrets, "btrfs-ssh", volume);
    const ports = await startProxyContainer({
      volume,
      path,
      publicKey,
      authorizedKeys: publicKey,
      configRoot,
      privileged: true,
      mountOptions: "rshared",
    });
    return ports;
  },
);

export const getBtrfsContainerPorts = reuseInFlight(async () => {
  return await getPorts({ volume: btrfsVolume() });
});

/**
 * Skeleton entry point for the multi-project host.
 *
 * Today this simply starts the Lite core so we have a runnable service.
 * Future layers will:
 *  - manage a project registry (podman + btrfs subvolumes/qgroups)
 *  - embed file-server per project
 *  - expose SSH/HTTP ingress via project-proxy/sshpiperd
 *  - connect to a master for auth/project placement
 */
import { main as startLite } from "@cocalc/lite/main";

export interface ProjectHostConfig {
  /**
   * Optional identifier for logging/coordination. Reserved for future use.
   */
  hostId?: string;
  /**
   * Whether to run Lite's remote/master connection logic. Defaults to Lite's own behavior.
   */
  enableRemote?: boolean;
}

export interface ProjectHostContext {
  port: number;
  host: string;
}

export async function main(
  _config: ProjectHostConfig = {},
): Promise<ProjectHostContext> {
  // For now, delegate to Lite's initialization. This keeps a runnable binary
  // while we layer in podman/btrfs/ingress functionality.
  const port = await startLite();
  const host = process.env.HOST ?? "localhost";
  return { port: port as number, host };
}

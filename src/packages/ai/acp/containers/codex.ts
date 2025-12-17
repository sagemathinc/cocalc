/**
 * Build (if missing) a local codex-acp container image.
 *
 * Why: We want to run the Codex ACP agent inside a dedicated podman container
 * for isolation. The container has no access to project files; all project
 * I/O/exec goes through our adapters. This helper ensures the image is present
 * on the host by building from a small Dockerfile (pulling our forked
 * codex-acp binary). Project-host can call this on startup before launching
 * codex-acp in container mode.
 * Using a container also makes it easy to use /root as the working directory
 * for agent sessions.
 */
import { build } from "@cocalc/backend/podman/build-container";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("ai:acp:container:codex");

const VERSION = "0.0.1";

// Local image name for the codex-acp container. Can be overridden by env if desired.
export const DEFAULT_CODEX_ACP_IMAGE = `codex-acp-x86_64:${VERSION}`;

// Minimal Dockerfile to run codex-acp from our forked release binary.
// Note: uses ubuntu:25.10 to match our project base image family.
const DOCKERFILE = `
FROM ubuntu:25.10
RUN apt-get update && \
    apt-get install -y ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /root

# Fetch codex-acp from our forked release. In the future, this could be replaced
# by a multi-stage build from source.

RUN curl -L https://github.com/sagemathinc/codex-acp/releases/download/v0.5.1/codex-acp-0.5.1-x86_64-unknown-linux-gnu.tar.gz -o /tmp/codex-acp.tar.gz && \
    tar -xzf /tmp/codex-acp.tar.gz -C /usr/local/bin && \
    rm /tmp/codex-acp.tar.gz

ENV HOME=/root

ENTRYPOINT ["/usr/local/bin/codex-acp"]
`;

export async function ensureCodexContainerImage(
  name: string = DEFAULT_CODEX_ACP_IMAGE,
): Promise<void> {
  logger.debug("ensure codex-acp image", { name });
  await build({
    Dockerfile: DOCKERFILE,
    name,
  });
}

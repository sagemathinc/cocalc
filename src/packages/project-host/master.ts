import { conat } from "@cocalc/backend/conat";
import { createServiceClient } from "@cocalc/conat/service/typed";
import getLogger from "@cocalc/backend/logger";
import { randomUUID } from "crypto";
import { getRow, upsertRow } from "@cocalc/lite/hub/sqlite/database";

const logger = getLogger("project-host:master");

const SUBJECT = "project-hosts";

interface HostRegistration {
  id: string;
  name?: string;
  region?: string;
  public_url?: string;
  internal_url?: string;
  ssh_server?: string;
  status?: string;
  version?: string;
  capacity?: any;
  metadata?: any;
}

export async function startMasterRegistration({
  hostId,
  runnerId,
  host,
  port,
}: {
  hostId?: string;
  runnerId: string;
  host: string;
  port: number;
}) {
  const masterAddress =
    process.env.MASTER_CONAT_SERVER ?? process.env.COCALC_MASTER_CONAT_SERVER;
  if (!masterAddress) {
    logger.debug("no master conat server configured; skipping registration");
    return;
  }

  const stored = getRow("project-host", "host-id")?.hostId as
    | string
    | undefined;
  const resolved =
    hostId ?? process.env.PROJECT_HOST_ID ?? stored ?? randomUUID();
  if (stored !== resolved) {
    upsertRow("project-host", "host-id", { hostId: resolved });
  }
  const id = resolved;
  const name = process.env.PROJECT_HOST_NAME ?? runnerId ?? id;
  const region = process.env.PROJECT_HOST_REGION;
  const public_url =
    process.env.PROJECT_HOST_PUBLIC_URL ?? `http://${host}:${port}`;
  const internal_url =
    process.env.PROJECT_HOST_INTERNAL_URL ?? `http://${host}:${port}`;
  const ssh_server =
    process.env.PROJECT_HOST_SSH_SERVER ??
    process.env.COCALC_SSH_SERVER ??
    `${host}:${2222}`;
  const status = "active";

  logger.info("registering with master", { masterAddress, id, public_url });

  // [ ] TODO: will have to worry about auth secret
  const client = conat({ address: masterAddress });

  const registry = createServiceClient<{
    register: (info: HostRegistration) => Promise<void>;
    heartbeat: (info: HostRegistration) => Promise<void>;
  }>({
    service: SUBJECT,
    subject: `${SUBJECT}.api`,
    client,
  });

  const payload: HostRegistration = {
    id,
    name,
    region,
    public_url,
    internal_url,
    ssh_server,
    status,
    metadata: { runnerId },
  };

  const send = async (fn: "register" | "heartbeat") => {
    try {
      await registry[fn](payload);
    } catch (err) {
      logger.warn(`failed to ${fn} host`, { err });
    }
  };

  await send("register");
  const timer = setInterval(() => void send("heartbeat"), 30_000);

  const stop = () => {
    clearInterval(timer);
    client.close?.();
  };
  ["SIGINT", "SIGTERM", "SIGQUIT", "exit"].forEach((sig) =>
    process.once(sig as any, stop),
  );

  return stop;
}

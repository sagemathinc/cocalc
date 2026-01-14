import { conat } from "@cocalc/backend/conat";
import { createServiceClient } from "@cocalc/conat/service/typed";
import getLogger from "@cocalc/backend/logger";
import { randomUUID } from "crypto";
import { getRow, upsertRow } from "@cocalc/lite/hub/sqlite/database";
import { createHostControlService } from "@cocalc/conat/project-host/api";
import { hubApi } from "@cocalc/lite/hub/api";
import { account_id } from "@cocalc/backend/data";
import { setMasterStatusClient } from "./master-status";
import { ensureHostKey } from "./ssh/host-key";
import {
  setHostPublicKey,
  setSshpiperdPublicKey,
  upsertRemoteHostKey,
} from "./ssh/host-keys";
import { ensureSshpiperdKey } from "./ssh/sshpiperd-key";
import { updateAuthorizedKeys, copyPaths } from "./hub/projects";
import {
  sendProject,
  finalizeReceiveProject,
  cleanupAfterMove,
  prepareMove,
} from "./hub/move";
import { getSoftwareVersions } from "./software";
import { upgradeSoftware } from "./upgrade";
import { executeCode } from "@cocalc/backend/execute-code";

const logger = getLogger("project-host:master");

const SUBJECT = "project-hosts";

interface HostRegistration {
  id: string;
  name?: string;
  region?: string;
  public_url?: string;
  internal_url?: string;
  ssh_server?: string;
  host_to_host_public_key?: string;
  sshpiperd_public_key?: string;
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
  logger.debug("startMasterRegistration", { masterAddress });

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

  logger.info("registering with master", { masterAddress, id, public_url });

  // [ ] TODO: will have to worry about auth secret
  const client = conat({ address: masterAddress });

  // Stable host SSH keypair for inter-host operations (rsync/reflect-sync).
  const hostKey = ensureHostKey(id);
  setHostPublicKey(id, hostKey.publicKey);
  // Stable sshpiperd keypair for inbound SSH ingress.
  const sshpiperdKey = ensureSshpiperdKey(id);
  setSshpiperdPublicKey(id, sshpiperdKey.publicKey);

  const registry = createServiceClient<{
    register: (info: HostRegistration) => Promise<void>;
    heartbeat: (info: HostRegistration) => Promise<void>;
  }>({
    service: SUBJECT,
    subject: `${SUBJECT}.api`,
    client,
  });

  // Control plane for this host (master can ask us to create/start/stop projects).
  const controlService = createHostControlService({
    host_id: id,
    client,
    impl: {
      async createProject(opts) {
        if (!hubApi.projects?.createProject) {
          throw Error("createProject not available");
        }
        const project_id = await hubApi.projects.createProject({
          ...opts,
          account_id,
        } as any);
        return { project_id };
      },
      async startProject({
        project_id,
        authorized_keys,
        run_quota,
        image,
        restore,
        lro_op_id,
      }) {
        if (!hubApi.projects?.start) {
          throw Error("start not available");
        }
        const status = await hubApi.projects.start({
          account_id,
          project_id,
          authorized_keys,
          run_quota,
          image,
          restore,
          lro_op_id,
        });
        return { project_id, state: (status as any)?.state };
      },
      async stopProject({ project_id }) {
        if (!hubApi.projects?.stop) {
          throw Error("stop not available");
        }
        const status = await hubApi.projects.stop({ account_id, project_id });
        return { project_id, state: (status as any)?.state };
      },
      async updateAuthorizedKeys({ project_id, authorized_keys }) {
        await updateAuthorizedKeys({
          project_id,
          authorized_keys,
        });
      },
      async prepareMove({ project_id }) {
        await prepareMove({ project_id });
      },
      copyPaths,
      sendProject,
      receiveProject: finalizeReceiveProject,
      cleanupAfterMove,
      upgradeSoftware,
      async growBtrfs({ disk_gb }) {
        const args = ["/usr/local/sbin/cocalc-grow-btrfs"];
        if (disk_gb != null) args.push(String(disk_gb));
        const { stdout, stderr, exit_code } = await executeCode({
          command: "sudo",
          args,
          timeout: 60,
        });
        if (exit_code) {
          throw new Error(
            `grow-btrfs failed (exit ${exit_code}): ${stderr || stdout || ""}`.trim(),
          );
        }
        return { ok: true };
      },
    },
  });

  const basePayload: HostRegistration = {
    id,
    name,
    region,
    public_url,
    internal_url,
    ssh_server,
    host_to_host_public_key: hostKey.publicKey,
    sshpiperd_public_key: sshpiperdKey.publicKey,
    metadata: {
      runnerId,
    },
  };

  setMasterStatusClient({
    client,
    host_id: id,
    host: {
      public_url,
      internal_url,
      ssh_server,
    },
  });

  const buildPayload = (): HostRegistration => {
    const versions = getSoftwareVersions();
    return {
      ...basePayload,
      version: versions.project_host ?? basePayload.version,
      metadata: {
        ...(basePayload.metadata ?? {}),
        software: versions,
      },
    };
  };

  const send = async (fn: "register" | "heartbeat") => {
    try {
      await registry[fn](buildPayload());
    } catch (err) {
      logger.warn(`failed to ${fn} host`, { err });
    }
  };

  await send("register");
  const timer = setInterval(() => void send("heartbeat"), 30_000);

  // Subscribe to host key updates from master and cache them locally.
  (async () => {
    try {
      const sub = await client.subscribe(`${SUBJECT}.keys`);
      for await (const msg of sub) {
        const data = msg.data as HostRegistration | undefined;
        if (data?.id) {
          if (data.host_to_host_public_key) {
            upsertRemoteHostKey(data.id, data.host_to_host_public_key);
          }
          if (data.sshpiperd_public_key) {
            setSshpiperdPublicKey(data.id, data.sshpiperd_public_key);
          }
        }
      }
    } catch (err) {
      logger.warn("host key subscription failed", { err });
    }
  })();

  const stop = () => {
    clearInterval(timer);
    client.close?.();
    controlService?.close?.();
  };
  ["SIGINT", "SIGTERM", "SIGQUIT", "exit"].forEach((sig) =>
    process.once(sig as any, stop),
  );

  return stop;
}

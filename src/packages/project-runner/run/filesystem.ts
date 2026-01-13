import {
  client as createFileClient,
  type Fileserver,
} from "@cocalc/conat/files/file-server";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import {
  sshServer as defaultSshServer,
  projectRunnerMountpoint,
  rusticRepo,
} from "@cocalc/backend/data";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { FILE_SERVER_NAME } from "@cocalc/conat/project/runner/constants";
import { filesystem, type Filesystem } from "@cocalc/file-server/btrfs";

//import getLogger from "@cocalc/backend/logger";

// const logger = getLogger("project-runner:filesystem");

let client: ConatClient | null = null;
export function init(opts: { client: ConatClient }) {
  client = opts.client;
}

let fsclient: Fileserver | null = null;
function getFsClient() {
  if (client == null) {
    throw Error("client not initialized");
  }
  fsclient ??= createFileClient({ client });
  return fsclient;
}

export function fileServerClient() {
  return getFsClient();
}

export async function setQuota(project_id: string, size: number | string) {
  const c = getFsClient();
  await c.setQuota({ project_id, size });
}

// default localPath if you don't specify something explicitly when calling
// init in project-runner/run/index.ts
// This is where the fileserver is storing files, and works if projects are
// running on the same compute as the file server, e.g., dev mode.
let fs: Filesystem | null = null;
export async function localPath({
  project_id,
  disk,
  scratch: scratchQuota,
  ensure = true,
}: {
  project_id: string;
  // if given, this quota will be set in case of btrfs
  disk?: number;
  // if given, a /scratch with this quota will be created
  // and mounted in the container as /scratch
  scratch?: number;
  // if false, resolve paths without creating volumes
  ensure?: boolean;
}): Promise<{ home: string; scratch?: string }> {
  if (projectRunnerMountpoint) {
    fs ??= await filesystem({
      mount: projectRunnerMountpoint,
      rustic: rusticRepo,
    });
    if (!ensure) {
      const home = join(projectRunnerMountpoint, `project-${project_id}`);
      const scratch = scratchQuota
        ? join(projectRunnerMountpoint, `scratch-project-${project_id}`)
        : undefined;
      return { home, scratch };
    }
    let home = "";
    let scratch: string | undefined;
    const createHome = async () => {
      const vol = await fs!.subvolumes.ensure(`project-${project_id}`);
      if (disk != null) {
        await vol.quota.set(disk);
      }
      home = vol.path;
    };
    const createScratch = async () => {
      if (!scratchQuota) return;
      const vol = await fs!.subvolumes.ensure(`scratch-project-${project_id}`);
      await vol.quota.set(scratchQuota);
      scratch = vol.path;
    };
    await Promise.all([createHome(), createScratch()]);
    if (!home) {
      throw Error("bug");
    }
    return { home, scratch };
  } else if (process.env.COCALC_PROJECT_PATH) {
    const path = join(process.env.COCALC_PROJECT_PATH, project_id);
    if (ensure) {
      await mkdir(path, { recursive: true });
    }
    return { home: path };
  }
  const c = getFsClient();
  if (ensure) {
    await c.ensureVolume({ project_id });
  }
  const { path } = await c.mount({ project_id });
  return { home: path };
}

// This is the server that we connect to for files and port forwards, which
// runs as part of the file server.
// default sshServer if you don't specify something explicitly when calling
// init in project-runner/run/index.ts
// This is what gets configured with defaults or via the COCALC_SSH_SERVER
// env variable in backend/data.  Again, this is what would work in dev
// mode when everything is on the same computer.
export async function sshServers({ project_id }: { project_id: string }) {
  const { host, port } = defaultSshServer;
  const volume = `project-${project_id}`;
  return [
    {
      name: FILE_SERVER_NAME,
      host,
      port,
      user: `${FILE_SERVER_NAME}-${volume}`,
    },
  ];
}

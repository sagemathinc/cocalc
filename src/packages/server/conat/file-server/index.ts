/*

*/

import { conat } from "@cocalc/backend/conat";
import {
  server as createFileServer,
  client as createFileClient,
  type Fileserver,
} from "@cocalc/conat/files/file-server";
export type { Fileserver };
import { isValidUUID } from "@cocalc/util/misc";
import { loadConatConfiguration } from "../configuration";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";
import { data } from "@cocalc/backend/data";
import { join } from "node:path";
import { mkdir } from "fs/promises";
import { filesystem, type Filesystem } from "@cocalc/file-server/btrfs";
import { exists } from "@cocalc/backend/misc/async-utils-node";

const logger = getLogger("server:conat:file-server");

function name(project_id: string) {
  return `project-${project_id}`;
}

async function mount({
  project_id,
}: {
  project_id: string;
}): Promise<{ path: string }> {
  if (!isValidUUID(project_id)) {
    throw Error("create: project_id must be a valid UUID");
  }
  logger.debug("mount", { project_id });
  if (fs == null) {
    throw Error("file server not initialized");
  }
  const vol = await fs.subvolumes.get(name(project_id));
  return { path: vol.path };
}

let fs: Filesystem | null = null;
let server: any = null;
export async function init() {
  if (server != null) {
    return;
  }
  await loadConatConfiguration();
  const image = join(data, "btrfs", "image");
  if (!(await exists(image))) {
    await mkdir(image, { recursive: true });
  }
  const btrfsDevice = join(image, "btrfs.img");
  const mountPoint = join(data, "btrfs", "mnt");
  if (!(await exists(mountPoint))) {
    await mkdir(mountPoint, { recursive: true });
  }

  fs = await filesystem({
    device: btrfsDevice,
    formatIfNeeded: true,
    mount: mountPoint,
    defaultFilesystemSize: "25G",
  });

  server = await createFileServer({
    client: conat(),
    mount: reuseInFlight(mount),
  });
}

export function close() {
  server?.close();
  server = null;
}

export function client(): Fileserver {
  return createFileClient({ client: conat() });
}

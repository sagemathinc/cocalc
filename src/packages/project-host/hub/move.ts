/*

. ../scripts/env0.sh 

require('../dist/main').main()

await require('../dist/hub/move').sendProject({
  project_id: '21c00a35-17af-42c7-82db-3c81a52e3c3e',
  dest_host_id: '5703cf9c-1727-4f4d-9865-ba8073bd40c9',
  dest_ssh_server: 'localhost:2223',
  snapshot: 'move-1765134051919'})

*/

import getLogger from "@cocalc/backend/logger";
import { isValidUUID } from "@cocalc/util/misc";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { getVolume } from "../file-server";
import { ensureHostKey } from "../ssh/host-key";
import { getSshpiperdPublicKey } from "../ssh/host-keys";
import { ensureProjectRow } from "./projects";
import { getLocalHostId } from "../sqlite/hosts";
import { runCmd, setupSshTempFiles } from "./util";
import { getMountPoint } from "../file-server";

const logger = getLogger("project-host:hub:move");

export async function sendProject({
  project_id,
  dest_host_id,
  dest_ssh_server,
  snapshot,
}: {
  project_id: string;
  dest_host_id: string;
  dest_ssh_server: string;
  snapshot: string;
}) {
  logger.debug("sendProject", {
    project_id,
    dest_host_id,
    dest_ssh_server,
    snapshot,
  });
  if (!isValidUUID(project_id)) throw Error("invalid project_id");
  const localHostId = getLocalHostId();
  if (!localHostId) throw Error("host id not set");
  const vol = await getVolume(project_id);
  const snapshotsDir = join(vol.path, ".snapshots");
  await mkdir(snapshotsDir, { recursive: true });
  const snapPath = join(snapshotsDir, snapshot);
  await runCmd(logger, "btrfs", [
    "subvolume",
    "snapshot",
    "-r",
    vol.path,
    snapPath,
  ]);
  logger.debug("sendProject: created snapshot", snapPath);

  const [sshHost, sshPort] = dest_ssh_server.includes(":")
    ? dest_ssh_server.split(":")
    : [dest_ssh_server, "22"];
  const tmp = await setupSshTempFiles({
    prefix: "ph-move-send-",
    privateKey: (() => {
      const localHostKey = ensureHostKey(localHostId);
      return localHostKey.privateKey;
    })(),
    knownHostsContent: (() => {
      const sshPiperdKey = getSshpiperdPublicKey(dest_host_id);
      if (!sshPiperdKey) {
        throw Error(`missing sshpiperd host key for ${dest_host_id}`);
      }
      return `[${sshHost}]:${sshPort} ${sshPiperdKey.trim()}\n`;
    })(),
  });
  const { keyFile, knownHosts, cleanup } = tmp;
  try {
    // Authenticate as the source host so the destination authorizes only that host key.
    const sshTarget = `btrfs-${localHostId}@${sshHost}`;
    const sshArgs = [
      "-p",
      sshPort,
      "-i",
      keyFile,
      "-o",
      "StrictHostKeyChecking=yes",
      "-o",
      `UserKnownHostsFile=${knownHosts}`,
      "-o",
      "IdentitiesOnly=yes",
      sshTarget,
      "btrfs",
      "receive",
      "/btrfs",
    ];

    // btrfs send | ssh ... sudo btrfs receive /btrfs
    logger.debug("sendProject: btrfs send|receive", {
      snapPath,
      ssh: sshArgs.join(" "),
    });
    const send = spawn("sudo", ["btrfs", "send", snapPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const ssh = spawn("ssh", sshArgs, {
      stdio: ["pipe", "inherit", "pipe"],
    });
    const sendErr: string[] = [];
    const sshErr: string[] = [];
    send.stderr?.on("data", (d) => {
      const msg = String(d);
      sendErr.push(msg);
      process.stderr.write(msg);
    });
    ssh.stderr?.on("data", (d) => {
      const msg = String(d);
      sshErr.push(msg);
      process.stderr.write(msg);
    });
    const sendOut = send.stdout;
    const sshIn = ssh.stdin;
    if (!sendOut || !sshIn) {
      logger.debug("sendProject: pipe for sending broken");
      throw new Error("btrfs send/ssh pipe not available");
    }
    // stdout/stdin are typed as possibly null because of mixed stdio options;
    // we guarded above, so cast is safe to satisfy TS here.
    (sendOut as any).pipe(sshIn as any);
    const result = await Promise.all([
      new Promise<void>((resolve, reject) => {
        send.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `btrfs send exit ${code}${
                    sendErr.length ? `: ${sendErr.join("")}` : ""
                  }`,
                ),
              ),
        );
        send.on("error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        ssh.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `ssh btrfs receive exit ${code}${
                    sshErr.length ? `: ${sshErr.join("")}` : ""
                  }`,
                ),
              ),
        );
        ssh.on("error", reject);
      }),
    ]);
    await result;
    logger.debug("sendProject: successfully received ", { snapPath });
  } finally {
    logger.debug("sendProject: cleaning up...", { snapPath });
    await cleanup();
    logger.debug("sendProject: clean up complete", { snapPath });
  }
}

export async function finalizeReceiveProject({
  project_id,
  snapshot,
  run_quota,
  title,
  users,
  image,
  authorized_keys,
}: {
  project_id: string;
  snapshot: string;
  run_quota?: any;
  title?: string;
  users?: any;
  image?: string;
  authorized_keys?: string;
}) {
  if (!isValidUUID(project_id)) throw Error("invalid project_id");
  const srcPath = join(getMountPoint(), snapshot);
  const destPath = join(getMountPoint(), `project-${project_id}`);

  // Create writable clone and drop the received snapshot.
  // Writable clone of the received snapshot, then drop the read-only snapshot.
  await runCmd(logger, "sudo", [
    "btrfs",
    "subvolume",
    "snapshot",
    srcPath,
    destPath,
  ]);
  await runCmd(logger, "sudo", ["btrfs", "subvolume", "delete", srcPath]);

  await mkdir(join(destPath, ".snapshots"), { recursive: true });

  // Register in sqlite.
  ensureProjectRow({
    project_id,
    opts: {
      title,
      users,
      image,
      run_quota,
    } as any,
    state: "stopped",
    authorized_keys,
  });
}

export async function cleanupAfterMove({
  project_id,
  snapshot,
  delete_original = true,
}: {
  project_id: string;
  snapshot: string;
  delete_original?: boolean;
}) {
  if (!isValidUUID(project_id)) throw Error("invalid project_id");
  const vol = await getVolume(project_id).catch(() => null);
  const snapPath = join(
    getMountPoint(),
    `project-${project_id}`,
    ".snapshots",
    snapshot,
  );
  await runCmd(logger, "sudo", [
    "btrfs",
    "subvolume",
    "delete",
    snapPath,
  ]).catch(() => {});
  if (delete_original && vol) {
    // Delete any snapshots under the source project before removing the project subvolume.
    const snapsDir = join(vol.path, ".snapshots");
    try {
      const snaps = await readdir(snapsDir);
      for (const name of snaps) {
        await runCmd(logger, "sudo", [
          "btrfs",
          "subvolume",
          "delete",
          join(snapsDir, name),
        ]).catch(() => {});
      }
    } catch {
      // ignore if snapshots dir missing or unreadable
    }
    await runCmd(logger, "sudo", [
      "btrfs",
      "subvolume",
      "delete",
      vol.path,
    ]).catch(() => {});
  }
}

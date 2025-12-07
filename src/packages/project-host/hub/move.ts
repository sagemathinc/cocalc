/*

. ../scripts/env0.sh

require('../dist/main').main()

await require('../dist/hub/move').sendProject({
  project_id: '21c00a35-17af-42c7-82db-3c81a52e3c3e',
  dest_host_id: '5703cf9c-1727-4f4d-9865-ba8073bd40c9',
  dest_ssh_server: 'localhost:2223', snapshot: 'move-1765134051920'})

*/

import getLogger from "@cocalc/backend/logger";
import { isValidUUID } from "@cocalc/util/misc";
import { join } from "node:path";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { getVolume } from "../file-server";
import { ensureHostKey } from "../ssh/host-key";
import { getSshpiperdPublicKey } from "../ssh/host-keys";
import { ensureProjectRow } from "./projects";
import { getLocalHostId } from "../sqlite/hosts";
import { runCmd, setupSshTempFiles } from "./util";
import { getMountPoint } from "../file-server";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { basename } from "node:path";

const logger = getLogger("project-host:hub:move");

type SubvolMeta = {
  path: string;
  uuid?: string;
  parent_uuid?: string;
  creation?: string;
};

async function readSubvolMeta(path: string): Promise<SubvolMeta> {
  return await new Promise<SubvolMeta>((resolve, reject) => {
    const child = spawn("sudo", ["btrfs", "subvolume", "show", path], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += String(d)));
    child.stderr?.on("data", (d) => (err += String(d)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        return reject(new Error(`btrfs subvolume show failed: ${err.trim()}`));
      }
      const meta: SubvolMeta = { path };
      const lines = out.split("\n");
      for (const line of lines) {
        const [k, ...rest] = line.split(":");
        const v = rest.join(":").trim();
        if (!v) continue;
        if (k.includes("UUID")) {
          if (k.toLowerCase().startsWith("uuid")) {
            meta.uuid = v;
          } else if (k.toLowerCase().includes("parent uuid")) {
            meta.parent_uuid = v;
          }
        } else if (k.toLowerCase().includes("creation time")) {
          meta.creation = v;
        }
      }
      resolve(meta);
    });
  });
}

function topoOrder(metas: SubvolMeta[]): SubvolMeta[] {
  const remaining = new Map(metas.map((m) => [m.path, m]));
  const ordered: SubvolMeta[] = [];
  // quick lookup by uuid
  const byUuid = new Map(
    metas.filter((m) => m.uuid).map((m) => [m.uuid as string, m]),
  );

  while (remaining.size) {
    let progressed = false;
    for (const [path, meta] of Array.from(remaining.entries())) {
      const parentUuid = meta.parent_uuid;
      if (
        !parentUuid ||
        !byUuid.get(parentUuid) ||
        ordered.includes(byUuid.get(parentUuid)!)
      ) {
        ordered.push(meta);
        remaining.delete(path);
        progressed = true;
      }
    }
    if (!progressed) {
      // break cycles/unknown parents by sorting remaining by creation time/string path
      const leftovers = Array.from(remaining.values()).sort(
        (a, b) =>
          (a.creation || "").localeCompare(b.creation || "") ||
          a.path.localeCompare(b.path),
      );
      leftovers.forEach((m) => {
        ordered.push(m);
        remaining.delete(m.path);
      });
    }
  }
  return ordered;
}

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
  const moveMode = "staged"; // or 'pipe'
  logger.debug("sendProject", {
    project_id,
    dest_host_id,
    dest_ssh_server,
    snapshot,
    mode: moveMode,
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

  // Common SSH config for all send/recv steps.
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

  // Authenticate as the source host so the destination authorizes only that host key.
  const sshTarget = `btrfs-${localHostId}@${sshHost}`;
  const sshBaseArgs = [
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
  ];

  if (moveMode === "staged") {
    await sendProjectStaged({
      project_id,
      snapshot,
      snapshotsDir,
      sshBaseArgs,
      sshPort,
      remoteBase: `/btrfs/_incoming/${project_id}`,
      sshTarget,
      keyFile,
      knownHosts,
    }).finally(async () => {
      await cleanup();
    });
    return;
  }

  const remoteBase = `/btrfs/_incoming/${project_id}`;
  async function ensureRemoteSnapshotsDir() {
    await runCmd(logger, "ssh", [
      ...sshBaseArgs,
      "mkdir",
      "-p",
      `${remoteBase}/.snapshots`,
    ]);
  }

  async function sendSnapshot({
    from,
    parent,
    recvDir,
  }: {
    from: string;
    parent?: string;
    recvDir: string;
  }) {
    const sendArgs = ["btrfs", "send"];
    if (parent) {
      sendArgs.push("-p", parent);
    }
    sendArgs.push(from);

    const sshArgs = [...sshBaseArgs, "btrfs", "receive", recvDir];

    logger.debug("sendProject.sendSnapshot: btrfs send|receive", {
      from,
      parent,
      recvDir,
      ssh: sshArgs.join(" "),
    });

    const send = spawn("sudo", sendArgs, {
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
      logger.debug("sendProject.sendSnapshot: pipe for sending broken");
      throw new Error("btrfs send/ssh pipe not available");
    }
    const streamPump = pipeline(sendOut, sshIn);
    await Promise.all([
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
      streamPump,
    ]);
    logger.debug("sendProject.sendSnapshot: successfully sent ", {
      from,
      parent,
      recvDir,
    });
  }

  try {
    // Ensure destination has a place for snapshots.
    await ensureRemoteSnapshotsDir();

    // Send existing snapshots (incremental in parent order).
    const snapshotNames = (await readdir(snapshotsDir)).filter(
      (s) => s !== snapshot,
    );
    const metas: SubvolMeta[] = [];
    for (const name of snapshotNames) {
      const path = join(snapshotsDir, name);
      metas.push(await readSubvolMeta(path));
    }
    const parentByUuid = new Map(
      metas.filter((m) => m.uuid).map((m) => [m.uuid as string, m.path]),
    );
    const ordered = topoOrder(metas);
    for (const meta of ordered) {
      const parentPath = meta.parent_uuid
        ? parentByUuid.get(meta.parent_uuid)
        : undefined;
      await sendSnapshot({
        from: meta.path,
        parent: parentPath,
        recvDir: `${remoteBase}/.snapshots`,
      });
    }

    // Finally send the move snapshot, optionally incremental from last snapshot in the chain.
    const lastSnapshotPath =
      ordered.length > 0 ? ordered[ordered.length - 1].path : undefined;
    await sendSnapshot({
      from: snapPath,
      parent: lastSnapshotPath,
      recvDir: remoteBase,
    });

    logger.debug("sendProject: successfully received ", { snapPath });
  } finally {
    logger.debug("sendProject: cleaning up...", { snapPath });
    await cleanup();
    logger.debug("sendProject: clean up complete", { snapPath });
  }
}

async function sendProjectStaged({
  project_id,
  snapshot,
  snapshotsDir,
  sshBaseArgs,
  sshPort,
  remoteBase,
  sshTarget,
  keyFile,
  knownHosts,
}: {
  project_id: string;
  snapshot: string;
  snapshotsDir: string;
  sshBaseArgs: string[];
  sshPort: string;
  remoteBase: string;
  sshTarget: string;
  keyFile: string;
  knownHosts: string;
}) {
  const streamsDir = join(getMountPoint(), "_streams", project_id, snapshot);
  await runCmd(logger, "sudo", ["mkdir", "-p", streamsDir]);
  if (typeof process.getuid === "function") {
    try {
      await runCmd(logger, "sudo", [
        "chown",
        `${process.getuid()}:${process.getgid?.() ?? process.getuid()}`,
        streamsDir,
      ]);
    } catch {
      // best effort; if it fails, send will likely fail and surface the error
    }
  }

  const makeSendFile = async ({
    from,
    parent,
    file,
  }: {
    from: string;
    parent?: string;
    file: string;
  }) => {
    const sendArgs = ["btrfs", "send"];
    if (parent) {
      sendArgs.push("-p", parent);
    }
    // Allow optional compression when supported.
    if (process.env.PROJECT_MOVE_SEND_COMPRESS?.toLowerCase() === "lz4") {
      sendArgs.push("-c", "lz4");
    }
    sendArgs.push(from, "-f", file);

    logger.debug("sendProjectStaged: btrfs send -> file", {
      from,
      parent,
      file,
    });

    const child = spawn("sudo", sendArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = createWriteStream(file);
    const errs: string[] = [];
    child.stderr?.on("data", (d) => errs.push(String(d)));
    await Promise.all([
      pipeline(child.stdout as any, out),
      new Promise<void>((resolve, reject) => {
        child.on("exit", (code) =>
          code === 0
            ? resolve()
            : reject(
                new Error(
                  `btrfs send exit ${code}${
                    errs.length ? `: ${errs.join("")}` : ""
                  }`,
                ),
              ),
        );
        child.on("error", reject);
      }),
    ]);
  };

  // Order snapshots by parent graph.
  const snapshotNames = (await readdir(snapshotsDir)).filter(
    (s) => s !== snapshot,
  );
  const metas: SubvolMeta[] = [];
  for (const name of snapshotNames) {
    const path = join(snapshotsDir, name);
    metas.push(await readSubvolMeta(path));
  }
  const parentByUuid = new Map(
    metas.filter((m) => m.uuid).map((m) => [m.uuid as string, m.path]),
  );
  const ordered = topoOrder(metas);

  type ManifestEntry = {
    file: string;
    recvDir: string;
  };
  const manifest: ManifestEntry[] = [];

  let idx = 0;
  const makeFileName = (name: string) =>
    `${String(idx++).padStart(4, "0")}-${name.replace(/\//g, "_")}.send`;

  // Existing snapshots first.
  for (const meta of ordered) {
    const parentPath = meta.parent_uuid
      ? parentByUuid.get(meta.parent_uuid)
      : undefined;
    const file = join(streamsDir, makeFileName(basename(meta.path)));
    await makeSendFile({ from: meta.path, parent: parentPath, file });
    manifest.push({ file, recvDir: `${remoteBase}/.snapshots` });
  }

  // Move snapshot (from live project).
  const snapPath = join(snapshotsDir, snapshot);
  const lastSnapshotPath =
    ordered.length > 0 ? ordered[ordered.length - 1].path : undefined;
  const moveFile = join(streamsDir, makeFileName(snapshot));
  await makeSendFile({
    from: snapPath,
    parent: lastSnapshotPath,
    file: moveFile,
  });
  manifest.push({ file: moveFile, recvDir: remoteBase });

  // Write manifest for debugging/resume inspection.
  await writeFile(
    join(streamsDir, "manifest.json"),
    JSON.stringify(
      {
        project_id,
        snapshot,
        mode: "staged",
        entries: manifest.map((m) => ({
          file: basename(m.file),
          recvDir: m.recvDir,
        })),
      },
      null,
      2,
    ),
  );

  // Prepare remote directories.
  const remoteStreams = `/btrfs/_incoming_streams/${project_id}/${snapshot}`;
  await runCmd(logger, "ssh", [
    ...sshBaseArgs,
    "sudo",
    "mkdir",
    "-p",
    `${remoteStreams}`,
    `${remoteBase}`,
    `${remoteBase}/.snapshots`,
  ]);

  // Rsync streams + manifest.
  const sshCmd = [
    "ssh",
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
  ].join(" ");
  await runCmd(logger, "rsync", [
    "-av",
    "--partial",
    "-e",
    sshCmd,
    `${streamsDir}/`,
    `${sshTarget}:${remoteStreams}/`,
  ]);

  // Receive on destination.
  for (const entry of manifest) {
    const remoteFile = `${remoteStreams}/${basename(entry.file)}`;
    const recvArgs = [
      ...sshBaseArgs,
      "sudo",
      "btrfs",
      "receive",
      "-f",
      remoteFile,
      entry.recvDir,
    ];
    logger.debug("sendProjectStaged: receive remote file", {
      remoteFile,
      recvDir: entry.recvDir,
    });
    await runCmd(logger, "ssh", recvArgs);
  }

  // Clean up remote streams to avoid residue.
  await runCmd(logger, "ssh", [
    ...sshBaseArgs,
    "sudo",
    "rm",
    "-rf",
    remoteStreams,
  ]).catch(() => {});
  // Clean up local streams.
  await rm(streamsDir, { recursive: true, force: true }).catch(() => {});
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
  const base = join(getMountPoint(), "_incoming", project_id);
  const recvMovePath = join(base, snapshot);
  const recvSnapshotsDir = join(base, ".snapshots");
  const destPath = join(getMountPoint(), `project-${project_id}`);

  // Determine latest snapshot (by creation time) to use as live clone.
  const receivedSnaps = await readdir(recvSnapshotsDir).catch(() => []);
  const snapMetas: SubvolMeta[] = [];
  for (const name of receivedSnaps) {
    snapMetas.push(await readSubvolMeta(join(recvSnapshotsDir, name)));
  }
  // Include the move snapshot itself.
  const moveMeta = await readSubvolMeta(recvMovePath);
  snapMetas.push(moveMeta);
  // Pick newest by creation (fallback lexicographic path).
  snapMetas.sort(
    (a, b) =>
      (a.creation || "").localeCompare(b.creation || "") ||
      a.path.localeCompare(b.path),
  );
  const latest = snapMetas[snapMetas.length - 1];

  // Create writable clone for the project.
  await runCmd(logger, "sudo", [
    "btrfs",
    "subvolume",
    "snapshot",
    latest.path,
    destPath,
  ]);
  await mkdir(join(destPath, ".snapshots"), { recursive: true });

  // Re-home snapshots under the project.
  for (const meta of snapMetas) {
    const name = meta.path.split("/").pop() as string;
    const destSnapPath = join(destPath, ".snapshots", name);
    await runCmd(logger, "sudo", [
      "btrfs",
      "subvolume",
      "snapshot",
      "-r",
      meta.path,
      destSnapPath,
    ]);
  }

  // Clean up staging area (delete received subvolumes).
  for (const meta of snapMetas) {
    await runCmd(logger, "sudo", [
      "btrfs",
      "subvolume",
      "delete",
      meta.path,
    ]).catch(() => {});
  }
  // base may be a regular directory; remove whatever remains.
  await runCmd(logger, "sudo", ["rm", "-rf", base]).catch(() => {});

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

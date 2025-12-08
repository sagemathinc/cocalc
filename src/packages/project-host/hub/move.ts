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
import { tmpdir } from "node:os";
import { MoveProgress } from "./move-progress";
import { getMasterConatClient } from "../master-status";

async function wipeIncomingDir(path: string) {
  // Best effort: delete any subvolumes inside, then remove the dir itself.
  const entries = await readdir(path).catch(() => null);
  if (entries) {
    for (const name of entries) {
      const full = join(path, name);
      await runCmd(logger, "sudo", ["btrfs", "subvolume", "delete", full]).catch(
        async () => {
          await runCmd(logger, "sudo", ["rm", "-rf", full]).catch(() => {});
        },
      );
    }
  }
  await runCmd(logger, "sudo", ["rm", "-rf", path]).catch(() => {});
}

export async function prepareMove({ project_id }: { project_id: string }) {
  if (!isValidUUID(project_id)) throw Error("invalid project_id");
  const incoming = join(getMountPoint(), "_incoming", project_id);
  const streams = join(getMountPoint(), "_incoming_streams", project_id);
  await wipeIncomingDir(incoming);
  await wipeIncomingDir(streams);
}


// NOTE: we implemented both a direct pipe and a staged move mode.
//   pipe -- use a single pipe and send|receive directly; optimal in terms of
//           amount of disk IO and space usage
//   staged -- write streams to files, rsync them over, then read them
//           from files; uses a lot more disk space and disk IO, but
//           is potentially more robust if the network is very flaky.
//           This also *could* maybe be implemented possibly more securely,
//           since the btrfs receive isn't controlled by the sender.
//
// For now we're focusing on pipe mode, and may deleted or revist staged
// later, depending on what requirements.  If connections are really bad,
// we might instead just use a "no snapshots and fallback to simple rsync
// mode".
//
const MOVE_MODE = "pipe"; // or 'staged'

const logger = getLogger("project-host:hub:move");

type SubvolMeta = {
  path: string;
  uuid?: string;
  parent_uuid?: string;
  creation?: string;
  generation?: number;
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
        } else if (k.toLowerCase().startsWith("generation")) {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n)) {
            meta.generation = n;
          }
        }
      }
      resolve(meta);
    });
  });
}

function topoOrder(metas: SubvolMeta[]): SubvolMeta[] {
  // Order snapshots by generation if present, otherwise creation time, then path.
  return [...metas].sort((a, b) => {
    const ga = a.generation ?? Number.MAX_SAFE_INTEGER;
    const gb = b.generation ?? Number.MAX_SAFE_INTEGER;
    if (ga !== gb) return ga - gb;
    const ca = a.creation ?? "";
    const cb = b.creation ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.path.localeCompare(b.path);
  });
}

// Entry point exposed via conat. Requires a progress_subject and returns quickly;
// the heavy work runs asynchronously and reports via the progress channel.
export async function sendProject(opts: {
  project_id: string;
  dest_host_id: string;
  dest_ssh_server: string;
  snapshot: string;
  progress_subject?: string;
}): Promise<void> {
  const {
    project_id,
    dest_host_id,
    dest_ssh_server,
    snapshot,
    progress_subject,
  } = opts;
  if (!progress_subject) {
    throw Error("progress_subject required");
  }
  if (!project_id || !dest_host_id || !dest_ssh_server || !snapshot) {
    throw Error("missing required parameter");
  }
  // Defer the heavy work to a microtask so the RPC returns immediately; all
  // progress and errors flow back over progress_subject.
  queueMicrotask(async () => {
    try {
      await _sendProject(opts);
    } catch (err) {
      logger.debug("sendProject async failed", { err });
      const client = getMasterConatClient();
      if (client) {
        try {
          await client.publish(progress_subject, {
            type: "error",
            message: `${err}`,
            project_id,
            ts: Date.now(),
          });
        } catch (pubErr) {
          logger.debug("sendProject: publish async error failed", { pubErr });
        }
      }
    }
  });
}

async function _sendProject({
  project_id,
  dest_host_id,
  dest_ssh_server,
  snapshot,
  progress_subject,
}: {
  project_id: string;
  dest_host_id: string;
  dest_ssh_server: string;
  snapshot: string;
  progress_subject?: string;
}) {
  const moveMode: string = MOVE_MODE;
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

  const progressClient = getMasterConatClient();
  const publishProgress = async (payload: any) => {
    if (!progress_subject || !progressClient) return;
    try {
      await progressClient.publish(progress_subject, {
        ...payload,
        project_id,
        ts: Date.now(),
      });
    } catch (err) {
      logger.debug("sendProject: publishProgress failed", { err });
    }
  };
  let heartbeat: NodeJS.Timeout | undefined;
  const startHeartbeat = () => {
    if (!progress_subject || !progressClient) return;
    heartbeat = setInterval(() => {
      publishProgress({ type: "heartbeat" });
    }, 5000).unref();
  };
  const stopHeartbeat = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = undefined;
    }
  };

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

  type SendProgress = (bytes: number) => void;

  async function sendSnapshot({
    from,
    parent,
    recvDir,
    onProgress,
  }: {
    from: string;
    parent?: string;
    recvDir: string;
    onProgress?: SendProgress;
  }): Promise<number> {
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
    let bytesSent = 0;
    let lastProgress = Date.now();
    sendOut.on("data", (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        bytesSent += chunk.length;
      } else {
        bytesSent += Buffer.byteLength(String(chunk));
      }
      if (onProgress) {
        const now = Date.now();
        if (now - lastProgress >= 1000) {
          lastProgress = now;
          try {
            onProgress(bytesSent);
          } catch {
            // best effort; ignore
          }
        }
      }
    });
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
    logger.debug(
      `sendProject.sendSnapshot: sent ${Math.round(bytesSent / 1000000)} MB`,
      {
        from,
        parent,
        recvDir,
      },
    );
    return bytesSent;
  }

  let tracker: MoveProgress | null = null;
  try {
    tracker = new MoveProgress({
      project_id,
      totalSnapshots: 1, // will update after we know count
      mode: moveMode,
    });
    await publishProgress({ type: "start", snapshot });
    startHeartbeat();
    await tracker.phase("preparing", "creating move snapshot");
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
    const ordered = topoOrder(metas);
    const totalSnapshots = ordered.length + 1;
    tracker.setTotal(totalSnapshots);
    await tracker.phase("sending", "sending snapshots");
    for (let i = 0; i < ordered.length; i++) {
      const meta = ordered[i];
      // Use the nearest previously-sent snapshot as the parent (generation order).
      let parentPath: string | undefined;
      for (let j = i - 1; j >= 0; j--) {
        parentPath = ordered[j].path;
        if (parentPath) break;
      }
      await tracker.snapshotStarted({
        name: basename(meta.path),
        index: i,
        total: totalSnapshots,
        parent: parentPath,
      });
      const bytes = await sendSnapshot({
        from: meta.path,
        parent: parentPath,
        recvDir: `${remoteBase}/.snapshots`,
        onProgress: (b) =>
          tracker?.snapshotProgress({
            name: basename(meta.path),
            index: i,
            total: totalSnapshots,
            parent: parentPath,
            bytes: b,
          }),
      });
      await tracker.snapshotFinished({
        name: basename(meta.path),
        index: i,
        total: totalSnapshots,
        parent: parentPath,
        bytes,
      });
      await publishProgress({
        type: "progress",
        snapshot: basename(meta.path),
        bytes,
      });
    }

    // Finally send the move snapshot, optionally incremental from last snapshot in the chain.
    const lastSnapshotPath =
      ordered.length > 0 ? ordered[ordered.length - 1].path : undefined;
    await tracker.snapshotStarted({
      name: basename(snapPath),
      index: totalSnapshots - 1,
      total: totalSnapshots,
      parent: lastSnapshotPath,
    });
    const moveBytes = await sendSnapshot({
      from: snapPath,
      parent: lastSnapshotPath,
      recvDir: remoteBase,
      onProgress: (b) =>
        tracker?.snapshotProgress({
          name: basename(snapPath),
          index: totalSnapshots - 1,
          total: totalSnapshots,
          parent: lastSnapshotPath,
          bytes: b,
        }),
    });
    await tracker.snapshotFinished({
      name: basename(snapPath),
      index: totalSnapshots - 1,
      total: totalSnapshots,
      parent: lastSnapshotPath,
      bytes: moveBytes,
    });
    await publishProgress({
      type: "progress",
      snapshot: basename(snapPath),
      bytes: moveBytes,
    });

    logger.debug("sendProject: successfully received ", { snapPath });
    await tracker.done();
    await publishProgress({ type: "done" });
  } catch (err) {
    if (tracker) {
      await tracker.fail(err);
    }
    await publishProgress({ type: "error", message: `${err}` });
    throw err;
  } finally {
    stopHeartbeat();
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
  // TODO...
  const streamsDir = join(tmpdir(), "_streams", project_id, snapshot);
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
  for (let i = 0; i < ordered.length; i++) {
    const meta = ordered[i];
    const parentPath = i > 0 ? ordered[i - 1].path : undefined;
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
    // The transient move snapshot is only needed to seed the live clone; skip
    // keeping a readonly copy in the final snapshots directory to avoid
    // accumulating move-* snapshots on the destination.
    if (name === snapshot) {
      continue;
    }
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

import getLogger from "@cocalc/backend/logger";
import { createHostControlClient } from "@cocalc/conat/project-host/api";
import {
  ensureMoveSchema,
  fetchActiveMoves,
  recycleStaleMoves,
  updateMove,
  type ProjectMoveRow,
} from "./move-db";
import { conatWithProjectRouting } from "../conat/route-client";
import {
  loadHostFromRegistry,
  loadProject,
  savePlacement,
  selectActiveHost,
  stopProjectOnHost,
} from "./control";
import { normalizeHostTier } from "./placement";

const MAX_PARALLEL_MOVES = 50;

const logger = getLogger("server:project-host:move-worker");

let running = false;

async function chooseDestination(
  source_host_id: string,
  dest_host_id?: string | null,
) {
  if (dest_host_id) return dest_host_id;
  const chosen = await selectActiveHost(source_host_id);
  if (!chosen) {
    throw Error("no active project-host available");
  }
  return chosen.id;
}

async function transition(
  project_id: string,
  updates: Partial<ProjectMoveRow>,
): Promise<ProjectMoveRow | undefined> {
  const row = await updateMove(project_id, updates);
  logger.debug("transition", row?.state, {
    project_id,
    dest_host_id: row?.dest_host_id,
  });
  return row;
}

async function handleQueued(row: ProjectMoveRow) {
  const meta = await loadProject(row.project_id);
  if (!meta.host_id) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: "project has no host",
    });
    return;
  }
  if (row.dest_host_id && row.dest_host_id === meta.host_id) {
    await transition(row.project_id, {
      state: "done",
      status_reason: "already on destination host",
    });
    return;
  }

  const dest_host_id = await chooseDestination(meta.host_id, row.dest_host_id);
  const snapshot = row.snapshot_name ?? `move-${Date.now()}`;

  await transition(row.project_id, {
    source_host_id: meta.host_id,
    dest_host_id,
    snapshot_name: snapshot,
    state: "preparing",
    status_reason: null,
    progress: { phase: "preparing" },
  });
}

async function handlePreparing(row: ProjectMoveRow) {
  const meta = await loadProject(row.project_id);
  if (!meta.host_id) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: "project has no host",
    });
    return;
  }
  try {
    await stopProjectOnHost(row.project_id);
    await transition(row.project_id, {
      state: "sending",
      progress: { phase: "sending" },
      status_reason: null,
    });
  } catch (err) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: `${err}`,
    });
  }
}

async function handleSending(row: ProjectMoveRow) {
  logger.debug("handleSending", {
    project_id: row.project_id,
    dest_host_id: row.dest_host_id,
  });
  //const moveMode = "staged"; //  or 'pipe'
  const moveMode = "pipe";
  const meta = await loadProject(row.project_id);
  if (!meta.host_id || !row.dest_host_id) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: "missing host assignment",
    });
    return;
  }
  const destHost = await loadHostFromRegistry(row.dest_host_id);
  logger.debug("handleSending", destHost?.ssh_server);
  if (!destHost?.ssh_server) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: "destination host missing ssh_server",
    });
    return;
  }
  const snapshot = row.snapshot_name ?? `move-${Date.now()}`;
  const conatClient = conatWithProjectRouting();
  const progressSubject = `project-host.progress.${row.project_id}.${Date.now()}`;
  const srcClient = createHostControlClient({
    host_id: meta.host_id,
    client: conatClient,
    // Long-running host operations (prepareMove, send) can take time on btrfs;
    // allow ample headroom so we rely on the progress channel/heartbeat for liveness.
    timeout: 120_000,
  });
  const destClient = createHostControlClient({
    host_id: row.dest_host_id,
    client: conatClient,
    timeout: 120_000,
  });
  const waitForProgress = async () => {
    const sub = await conatClient.subscribe(progressSubject);
    let timer: NodeJS.Timeout | undefined;
    const reset = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        sub.return?.();
      }, 20_000);
    };
    reset();
    return await new Promise<void>((resolve, reject) => {
      (async () => {
        try {
          for await (const msg of sub) {
            reset();
            const data: any = msg.data ?? {};
            if (data.type === "error") {
              sub.return?.();
              return reject(new Error(data.message || "move error"));
            }
            if (data.type === "done") {
              sub.return?.();
              return resolve();
            }
          }
          reject(new Error("progress stream ended"));
        } catch (err) {
          reject(err);
        } finally {
          if (timer) clearTimeout(timer);
        }
      })();
    });
  };
  try {
    await transition(row.project_id, {
      progress: { phase: "sending", mode: moveMode },
    });
    // Clean up any partial state from previous attempts on the destination.
    await destClient.prepareMove({ project_id: row.project_id });
    logger.debug("handleSending: sending", {
      project_id: row.project_id,
      dest_host_id: row.dest_host_id,
      dest_ssh_server: destHost.ssh_server,
      snapshot,
    });
    await Promise.all([
      srcClient.sendProject({
        project_id: row.project_id,
        dest_host_id: row.dest_host_id,
        dest_ssh_server: destHost.ssh_server,
        snapshot,
        progress_subject: progressSubject,
      }),
      waitForProgress(),
    ]);
    logger.debug("handleSending: successfully sent", {
      project_id: row.project_id,
      snapshot,
    });
    await transition(row.project_id, {
      state: "finalizing",
      progress: { phase: "finalizing" },
      snapshot_name: snapshot,
    });
  } catch (err) {
    logger.debug("handleSending: failed", err);
    await transition(row.project_id, {
      state: "failing",
      status_reason: `${err}`,
    });
  }
}

async function handleFinalizing(row: ProjectMoveRow) {
  logger.debug("handleFinalizing", {
    project_id: row.project_id,
    dest_host_id: row.dest_host_id,
  });
  const meta = await loadProject(row.project_id);
  if (!meta.host_id || !row.dest_host_id) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: "missing host assignment",
    });
    return;
  }
  const destHost = await loadHostFromRegistry(row.dest_host_id);
  if (!destHost?.ssh_server) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: "destination host missing ssh_server",
    });
    return;
  }
  const snapshot = row.snapshot_name ?? `move-${Date.now()}`;
  const conatClient = conatWithProjectRouting();
  const srcClient = createHostControlClient({
    host_id: meta.host_id,
    client: conatClient,
  });
  const destClient = createHostControlClient({
    host_id: row.dest_host_id,
    client: conatClient,
  });
  try {
    await destClient.receiveProject({
      project_id: row.project_id,
      snapshot,
      run_quota: meta.run_quota,
      title: meta.title,
      users: meta.users,
      image: meta.image,
      authorized_keys: meta.authorized_keys,
    });

    await savePlacement(row.project_id, {
      host_id: row.dest_host_id,
      host: {
        name: destHost.name,
        region: destHost.region,
        tier: normalizeHostTier(destHost.tier),
        public_url: destHost.public_url,
        internal_url: destHost.internal_url,
        ssh_server: destHost.ssh_server,
      },
    });

    await srcClient.cleanupAfterMove({
      project_id: row.project_id,
      snapshot,
      delete_original: true,
    });

    await transition(row.project_id, {
      state: "done",
      progress: { phase: "done" },
      status_reason: "move complete; project not auto-started",
    });
  } catch (err) {
    await transition(row.project_id, {
      state: "failing",
      status_reason: `${err}`,
    });
  }
}

async function processRow(row: ProjectMoveRow) {
  switch (row.state) {
    case "queued":
      await handleQueued(row);
      break;
    case "preparing":
      await handlePreparing(row);
      break;
    case "sending":
      await handleSending(row);
      break;
    case "finalizing":
      await handleFinalizing(row);
      break;
    default:
      break;
  }
}

export async function startProjectMoveWorker() {
  await ensureMoveSchema();
  if (running) return;
  running = true;
  logger.info("starting project move worker (maintenance hub)");

  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const recycled = await recycleStaleMoves();
      if (recycled) {
        logger.info("recycled stale moves", { count: recycled });
      }
      const rows = await fetchActiveMoves(MAX_PARALLEL_MOVES);
      if (rows.length) {
        await Promise.all(rows.map((row) => processRow(row)));
      }
    } catch (err) {
      logger.warn("move worker tick failed", { err });
    } finally {
      ticking = false;
    }
  };
  // simple poll loop; moves are long-running and restart-safe via DB state
  setInterval(() => {
    void tick();
  }, 1000);

  // kick once immediately
  void tick();
}

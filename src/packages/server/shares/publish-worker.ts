import { randomUUID } from "node:crypto";
import getLogger from "@cocalc/backend/logger";
import type { LroSummary } from "@cocalc/conat/hub/api/lro";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";
import { claimLroOps, touchLro, updateLro } from "@cocalc/server/lro/lro-db";
import { client as fileServerClient } from "@cocalc/conat/files/file-server";
import {
  getPublishedShareById,
  updatePublishedSharePublishStatus,
} from "@cocalc/server/shares/db";
import { resolveShareBucketConfig } from "@cocalc/server/shares/storage";

const logger = getLogger("server:shares:publish-worker");

export const SHARE_PUBLISH_LRO_KIND = "share-publish";
const OWNER_TYPE = "hub" as const;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const TICK_MS = 5_000;
const MAX_PARALLEL = 1;

const WORKER_ID = randomUUID();

const progressSteps: Record<string, number> = {
  validate: 5,
  publish: 80,
  done: 100,
};

let running = false;
let inFlight = 0;

function publishSummary(summary: LroSummary) {
  return publishLroSummary({
    scope_type: summary.scope_type,
    scope_id: summary.scope_id,
    summary,
  });
}

function progressEvent({
  op,
  step,
  message,
  detail,
}: {
  op: LroSummary;
  step: string;
  message?: string;
  detail?: any;
}) {
  void publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: step,
      message,
      progress: progressSteps[step],
      detail,
    },
  });
}

async function handlePublishOp(op: LroSummary): Promise<void> {
  const { op_id } = op;
  const input = op.input ?? {};
  const project_id = input.project_id;
  const share_id = input.share_id;

  if (!project_id || !share_id) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: "share publish op missing project_id or share_id",
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  const share = await getPublishedShareById(share_id);
  if (!share || share.project_id !== project_id) {
    const updated = await updateLro({
      op_id,
      status: "failed",
      error: "share publish op does not match share project",
    });
    if (updated) {
      await publishSummary(updated);
    }
    return;
  }

  logger.info("share publish op start", { op_id, project_id, share_id });

  const heartbeat = setInterval(() => {
    touchLro({ op_id, owner_type: OWNER_TYPE, owner_id: WORKER_ID }).catch(
      (err) => logger.debug("share publish heartbeat failed", { op_id, err }),
    );
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    const running = await updateLro({
      op_id,
      status: "running",
      error: null,
      progress_summary: { phase: "validate" },
    });
    if (running) {
      await publishSummary(running);
    }
    progressEvent({
      op,
      step: "validate",
      message: "starting publish",
      detail: { project_id, share_id },
    });

    await updatePublishedSharePublishStatus({
      share_id,
      status: "running",
      error: null,
    });

    progressEvent({
      op,
      step: "publish",
      message: "starting share publish",
    });

    const bucket = await resolveShareBucketConfig({ project_id });
    const result = await fileServerClient({ project_id }).publishShare({
      project_id,
      share_id,
      path: share.path,
      scope: share.scope,
      indexing_opt_in: share.indexing_opt_in,
      latest_manifest_id: share.latest_manifest_id,
      bucket,
      lro: { op_id, scope_type: op.scope_type, scope_id: op.scope_id },
    });

    await updatePublishedSharePublishStatus({
      share_id,
      status: "succeeded",
      error: null,
      latest_manifest_id: result.manifest_id,
      latest_manifest_hash: result.manifest_hash,
      published_at: new Date(result.published_at),
      size_bytes: result.size_bytes,
    });

    const updated = await updateLro({
      op_id,
      status: "succeeded",
      result: result,
      progress_summary: {
        phase: "done",
        manifest_id: result.manifest_id,
        file_count: result.file_count,
        size_bytes: result.size_bytes,
      },
      error: null,
    });
    if (updated) {
      await publishSummary(updated);
    }
    progressEvent({
      op,
      step: "done",
      message: "publish complete",
      detail: {
        manifest_id: result.manifest_id,
        file_count: result.file_count,
        size_bytes: result.size_bytes,
      },
    });
  } catch (err) {
    const error = `${err}`;
    logger.warn("share publish op failed", { op_id, err: error });
    await updatePublishedSharePublishStatus({
      share_id,
      status: "failed",
      error,
    });
    const updated = await updateLro({
      op_id,
      status: "failed",
      error,
      progress_summary: { phase: "done" },
    });
    if (updated) {
      await publishSummary(updated);
    }
    progressEvent({ op, step: "done", message: "failed" });
  } finally {
    clearInterval(heartbeat);
    logger.info("share publish op cleanup", { op_id });
  }
}

export function startSharePublishLroWorker({
  intervalMs = TICK_MS,
  maxParallel = MAX_PARALLEL,
} = {}) {
  if (running) return () => undefined;
  running = true;
  logger.info("starting share publish LRO worker", { worker_id: WORKER_ID });

  const tick = async () => {
    if (inFlight >= maxParallel) return;
    let ops: LroSummary[] = [];
    try {
      ops = await claimLroOps({
        kind: SHARE_PUBLISH_LRO_KIND,
        owner_type: OWNER_TYPE,
        owner_id: WORKER_ID,
        limit: Math.max(1, maxParallel - inFlight),
        lease_ms: LEASE_MS,
      });
    } catch (err) {
      logger.warn("share publish op claim failed", { err });
      return;
    }

    for (const op of ops) {
      inFlight += 1;
      void handlePublishOp(op)
        .catch(async (err) => {
          logger.warn("share publish op handler failed", {
            op_id: op.op_id,
            err,
          });
          const updated = await updateLro({
            op_id: op.op_id,
            status: "failed",
            error: `${err}`,
            progress_summary: { phase: "done" },
          });
          if (updated) {
            await publishSummary(updated);
          }
        })
        .finally(() => {
          inFlight = Math.max(0, inFlight - 1);
        });
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref?.();

  void tick();

  return () => {
    running = false;
    clearInterval(timer);
  };
}

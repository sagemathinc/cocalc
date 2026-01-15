/*
 * Publish progress events for long-running operations (LRO) via conat streams.
 */
import { type Client } from "@cocalc/conat/core/client";
import { conat, getLogger } from "@cocalc/conat/client";
import type { LroEvent } from "@cocalc/conat/hub/api/lro";
import { lroStreamName } from "@cocalc/conat/lro/names";

const logger = getLogger("conat:lro:progress");
const DEFAULT_TTL = 1000 * 60 * 60;

const startTimes: { [key: string]: number } = {};

export type LroProgressEvent = {
  phase: string;
  message?: string;
  progress?: number;
  min?: number;
  max?: number;
  error?: unknown;
  elapsed?: number;
  speed?: string;
  eta?: number;
  detail?: any;
  level?: "info" | "warn" | "error";
};

export async function lroProgress({
  op_id,
  project_id,
  account_id,
  host_id,
  client = conat(),
  ttl = DEFAULT_TTL,
  ...event
}: {
  op_id?: string;
  project_id?: string;
  account_id?: string;
  host_id?: string;
  client?: Client;
  ttl?: number;
} & LroProgressEvent): Promise<void> {
  if (!op_id) return;
  if (!project_id && !account_id && !host_id) return;

  const stream = client.sync.astream<LroEvent>({
    project_id,
    account_id,
    host_id,
    name: lroStreamName(op_id),
    ephemeral: true,
  });

  const errorMessage =
    event.error != null
      ? typeof event.error === "string"
        ? event.error
        : `${event.error}`
      : undefined;

  let elapsed = event.elapsed;
  let progress = undefined as number | undefined;
  if (event.progress != null) {
    const key = `${op_id}-${event.phase}`;
    if (!event.progress) {
      startTimes[key] = Date.now();
      elapsed = 0;
    } else if (startTimes[key]) {
      elapsed = Date.now() - startTimes[key];
    }
    progress = shiftProgress({
      progress: event.progress,
      min: event.min,
      max: event.max,
    });
  }

  const detail: any = { ...(event.detail ?? {}) };
  if (elapsed != null) detail.elapsed = elapsed;
  if (event.speed != null) detail.speed = event.speed;
  if (event.eta != null) detail.eta = event.eta;
  if (errorMessage != null) detail.error = errorMessage;

  const payload: LroEvent = {
    type: "progress",
    ts: Date.now(),
    phase: event.phase,
    message: event.message,
    progress,
    detail: Object.keys(detail).length ? detail : undefined,
    level: errorMessage ? "error" : event.level,
  };

  try {
    await stream.publish(payload, { ttl });
  } catch (err) {
    logger.debug("ERROR publishing lro progress", { op_id, err });
  }
}

export function shiftProgress<T extends number | undefined>({
  progress,
  min = 0,
  max = 100,
}: {
  progress: T;
  min?: number;
  max?: number;
}): T extends number ? number : undefined {
  if (progress == null) {
    return undefined as any;
  }
  return Math.round(min + (progress / 100) * (max - min)) as any;
}

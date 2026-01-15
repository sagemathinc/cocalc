import { conat } from "@cocalc/conat/client";
import type { Client } from "@cocalc/conat/core/client";
import type { DStream } from "@cocalc/conat/sync/dstream";
import type {
  LroEvent,
  LroScopeType,
  LroStatus,
  LroSummary,
} from "@cocalc/conat/hub/api/lro";
import { isValidUUID } from "@cocalc/util/misc";
import { lroStreamName } from "./names";

type LroLocation = {
  project_id?: string;
  account_id?: string;
  host_id?: string;
};

function scopeLocation({
  scope_type,
  scope_id,
}: {
  scope_type: LroScopeType;
  scope_id?: string;
}): LroLocation {
  if (scope_type === "hub") {
    return {};
  }
  if (!scope_id) {
    throw new Error("scope_id must be set");
  }
  if (!isValidUUID(scope_id)) {
    throw new Error("scope_id must be a valid uuid");
  }
  if (scope_type === "project") {
    return { project_id: scope_id };
  }
  if (scope_type === "account") {
    return { account_id: scope_id };
  }
  if (scope_type === "host") {
    return { host_id: scope_id };
  }
  throw new Error(`unsupported scope_type: ${scope_type}`);
}

export async function get({
  op_id,
  stream_name,
  scope_type,
  scope_id,
  client = conat(),
}: {
  op_id?: string;
  stream_name?: string;
  scope_type: LroScopeType;
  scope_id?: string;
  client?: Client;
}): Promise<DStream<LroEvent>> {
  const name = stream_name ?? (op_id ? lroStreamName(op_id) : "");
  if (!name) {
    throw new Error("op_id or stream_name must be set");
  }
  const location = scopeLocation({ scope_type, scope_id });
  // LRO progress streams must be ephemeral: they are high-volume, short-lived,
  // and the first client to open the stream fixes the storage mode (avoiding
  // a race that could require a project root before it exists).
  return await client.sync.dstream<LroEvent>({
    ...location,
    name,
    ephemeral: true,
  });
}

const TERMINAL_STATUSES = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export async function waitForCompletion({
  op_id,
  stream_name,
  scope_type,
  scope_id,
  client = conat(),
  timeout_ms,
  onProgress,
  onSummary,
}: {
  op_id?: string;
  stream_name?: string;
  scope_type: LroScopeType;
  scope_id?: string;
  client?: Client;
  timeout_ms?: number;
  onProgress?: (event: Extract<LroEvent, { type: "progress" }>) => void;
  onSummary?: (summary: LroSummary) => void;
}): Promise<LroSummary> {
  const stream = await get({
    op_id,
    stream_name,
    scope_type,
    scope_id,
    client,
  });
  let lastIndex = 0;
  let done = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return await new Promise<LroSummary>((resolve, reject) => {
    const finish = (summary: LroSummary) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(summary);
    };

    const fail = (err: Error) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };

    const handleChange = () => {
      if (done) return;
      let events: LroEvent[];
      try {
        events = stream.getAll();
      } catch (err) {
        fail(err as Error);
        return;
      }
      if (events.length < lastIndex) {
        lastIndex = 0;
      }
      for (let i = lastIndex; i < events.length; i += 1) {
        const event = events[i];
        if (event.type === "progress") {
          onProgress?.(event);
        }
        if (event.type === "summary") {
          onSummary?.(event.summary);
          if (TERMINAL_STATUSES.has(event.summary.status)) {
            finish(event.summary);
            return;
          }
        }
      }
      lastIndex = events.length;
    };

    const handleClosed = () => {
      fail(new Error("lro stream closed before completion"));
    };

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      stream.removeListener("change", handleChange);
      stream.removeListener("closed", handleClosed);
      stream.close();
    };

    stream.on("change", handleChange);
    stream.on("closed", handleClosed);
    handleChange();

    if (timeout_ms && timeout_ms > 0) {
      timeoutId = setTimeout(() => {
        fail(new Error("timeout waiting for lro completion"));
      }, timeout_ms);
    }
  });
}

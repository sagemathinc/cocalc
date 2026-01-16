import { useCallback, useEffect, useRef, useState } from "@cocalc/frontend/app-framework";
import type { DStream } from "@cocalc/conat/sync/dstream";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { LroEvent, LroStatus, LroSummary } from "@cocalc/conat/hub/api/lro";

const HOST_LRO_REFRESH_MS = 30_000;
const TERMINAL_STATUSES = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export function isHostOpActive(op?: HostLroState): boolean {
  if (!op) return false;
  const status = op.summary?.status;
  if (!status) return true;
  return !TERMINAL_STATUSES.has(status);
}

export type HostLroState = {
  op_id: string;
  kind?: string;
  summary?: LroSummary;
  last_progress?: Extract<LroEvent, { type: "progress" }>;
  last_event?: LroEvent;
};

type UseHostOpsOptions = {
  hosts: Host[];
  listLro: (opts: {
    scope_type: "host";
    scope_id: string;
    include_completed?: boolean;
  }) => Promise<LroSummary[]>;
  getLroStream: (opts: {
    op_id: string;
    scope_type: LroSummary["scope_type"];
    scope_id: string;
  }) => Promise<DStream<LroEvent>>;
};

function toTime(summary: LroSummary): number {
  const candidate = summary.updated_at ?? summary.created_at;
  const date = new Date(candidate as any);
  const ts = date.getTime();
  if (Number.isFinite(ts)) return ts;
  return 0;
}

export function useHostOps({
  hosts,
  listLro,
  getLroStream,
}: UseHostOpsOptions) {
  const [hostOps, setHostOps] = useState<Record<string, HostLroState>>({});
  const streamsRef = useRef(new Map<string, DStream<LroEvent>>());
  const streamInitRef = useRef(new Map<string, Promise<void>>());
  const hostIdsRef = useRef<string[]>([]);
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const closedRef = useRef(false);

  const closeStream = useCallback((op_id: string) => {
    const stream = streamsRef.current.get(op_id);
    if (stream) {
      stream.close();
    }
    streamsRef.current.delete(op_id);
    streamInitRef.current.delete(op_id);
  }, []);

  const updateFromStream = useCallback(
    (host_id: string, op_id: string) => {
      const stream = streamsRef.current.get(op_id);
      if (!stream) return;
      const events = stream.getAll();
      if (!events.length) return;
      setHostOps((prev) => {
        const current = prev[host_id];
        if (!current || current.op_id !== op_id) {
          return prev;
        }
        let summary = current.summary;
        let kind = current.kind;
        let lastProgress = current.last_progress;
        let lastEvent = current.last_event;
        let lastProgressTs = lastProgress?.ts ?? -1;
        let lastEventTs = lastEvent?.ts ?? -1;
        let lastSummaryTs = -1;
        for (const event of events) {
          if (event.type === "summary") {
            if (event.ts >= lastSummaryTs) {
              summary = event.summary;
              kind = event.summary.kind ?? kind;
              lastSummaryTs = event.ts;
            }
          } else if (event.type === "progress") {
            if (event.ts >= lastProgressTs) {
              lastProgress = event;
              lastProgressTs = event.ts;
            }
          }
          if (event.ts >= lastEventTs) {
            lastEvent = event;
            lastEventTs = event.ts;
          }
        }
        const next: Record<string, HostLroState> = {
          ...prev,
          [host_id]: {
            ...current,
            op_id,
            kind,
            summary,
            last_progress: lastProgress,
            last_event: lastEvent,
          },
        };
        if (summary && TERMINAL_STATUSES.has(summary.status)) {
          closeStream(op_id);
        }
        return next;
      });
    },
    [closeStream],
  );

  const ensureStream = useCallback(
    async (host_id: string, op_id: string, scope_id: string) => {
      if (streamsRef.current.has(op_id) || streamInitRef.current.has(op_id)) {
        return;
      }
      const init = (async () => {
        const stream = await getLroStream({
          op_id,
          scope_type: "host",
          scope_id,
        });
        if (closedRef.current) {
          stream.close();
          return;
        }
        stream.on("change", () => updateFromStream(host_id, op_id));
        streamsRef.current.set(op_id, stream);
        updateFromStream(host_id, op_id);
      })().catch((err) => {
        console.warn("unable to subscribe to host operation", { op_id, err });
      });
      streamInitRef.current.set(op_id, init);
      init.finally(() => {
        streamInitRef.current.delete(op_id);
      });
    },
    [getLroStream, updateFromStream],
  );

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }
    const run = (async () => {
      const ids = hostIdsRef.current;
      const next: Record<string, HostLroState> = {};
      const activeOpIds = new Set<string>();
      await Promise.all(
        ids.map(async (id) => {
          try {
            const ops = await listLro({
              scope_type: "host",
              scope_id: id,
              include_completed: false,
            });
            const hostOps = ops.filter((op) => op.kind?.startsWith("host-"));
            if (!hostOps.length) {
              return;
            }
            const latest = hostOps.sort((a, b) => toTime(b) - toTime(a))[0];
            if (!latest) return;
            next[id] = { op_id: latest.op_id, summary: latest, kind: latest.kind };
            activeOpIds.add(latest.op_id);
            await ensureStream(id, latest.op_id, latest.scope_id);
          } catch (err) {
            console.warn("unable to refresh host operations", { id, err });
          }
        }),
      );
      setHostOps(next);
      for (const op_id of streamsRef.current.keys()) {
        if (!activeOpIds.has(op_id)) {
          closeStream(op_id);
        }
      }
    })();
    refreshInFlight.current = run.finally(() => {
      refreshInFlight.current = null;
    });
    return refreshInFlight.current;
  }, [closeStream, ensureStream, listLro]);

  useEffect(() => {
    hostIdsRef.current = hosts
      .filter((host) => !host.deleted)
      .map((host) => host.id);
    refresh().catch(() => {});
  }, [hosts, refresh]);

  useEffect(() => {
    closedRef.current = false;
    const timer = setInterval(() => {
      refresh().catch(() => {});
    }, HOST_LRO_REFRESH_MS);
    return () => {
      closedRef.current = true;
      clearInterval(timer);
      for (const stream of streamsRef.current.values()) {
        stream.close();
      }
      streamsRef.current.clear();
      streamInitRef.current.clear();
    };
  }, [refresh]);

  const trackHostOp = useCallback(
    (
      host_id: string,
      op: { op_id: string; scope_id?: string; kind?: string },
    ) => {
      const op_id = op.op_id;
      setHostOps((prev) => ({
        ...prev,
        [host_id]: {
          ...(prev[host_id] ?? { op_id }),
          op_id,
          kind: op.kind ?? prev[host_id]?.kind,
        },
      }));
      void ensureStream(host_id, op_id, op.scope_id ?? host_id);
    },
    [ensureStream],
  );

  return { hostOps, trackHostOp };
}

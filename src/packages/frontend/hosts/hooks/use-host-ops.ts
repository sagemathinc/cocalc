import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import type { DStream } from "@cocalc/conat/sync/dstream";
import type { Host } from "@cocalc/conat/hub/api/hosts";
import type { LroEvent, LroSummary } from "@cocalc/conat/hub/api/lro";
import {
  applyLroEvents,
  isDismissed,
  isTerminal,
  toTime,
} from "@cocalc/frontend/lro/utils";
import { lite } from "@cocalc/frontend/lite";

const HOST_LRO_REFRESH_MS = 60_000;
const HOST_LRO_FULL_REFRESH_MS = 5 * 60_000;
const TRANSITION_STATUSES = new Set([
  "starting",
  "stopping",
  "restarting",
  "deprovisioning",
]);

export function isHostOpActive(op?: HostLroState): boolean {
  if (!op) return false;
  const status = op.summary?.status;
  if (!status) return true;
  return !isTerminal(status);
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
  onUpgradeComplete?: (summary: LroSummary) => void;
};

export function useHostOps({
  hosts,
  listLro,
  getLroStream,
  onUpgradeComplete,
}: UseHostOpsOptions) {
  const [hostOps, setHostOps] = useState<Record<string, HostLroState>>({});
  const streamsRef = useRef(new Map<string, DStream<LroEvent>>());
  const streamInitRef = useRef(new Map<string, Promise<void>>());
  const hostIdsRef = useRef<string[]>([]);
  const hostMetaRef = useRef<
    { id: string; status?: string; last_action_status?: string | null }[]
  >([]);
  const hostOpsRef = useRef<Record<string, HostLroState>>({});
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const closedRef = useRef(false);
  const completedRef = useRef(new Set<string>());
  const lastFullRefreshRef = useRef(0);

  const closeStream = useCallback((op_id: string) => {
    const stream = streamsRef.current.get(op_id);
    if (stream) {
      stream.close();
    }
    streamsRef.current.delete(op_id);
    streamInitRef.current.delete(op_id);
  }, []);

  const applyEvents = useCallback(
    (host_id: string, op_id: string, events: LroEvent[]) => {
      if (!events.length) return;
      setHostOps((prev) => {
        const current = prev[host_id];
        if (!current || current.op_id !== op_id) {
          return prev;
        }
        const updates = applyLroEvents({
          events,
          summary: current.summary,
          last_progress: current.last_progress,
          last_event: current.last_event,
        });
        const summary = updates.summary;
        if (isDismissed(summary)) {
          closeStream(op_id);
          const next = { ...prev };
          delete next[host_id];
          return next;
        }
        const kind = summary?.kind ?? current.kind;
        if (
          summary &&
          isTerminal(summary.status) &&
          !completedRef.current.has(summary.op_id)
        ) {
          completedRef.current.add(summary.op_id);
          if (
            summary.kind === "host-upgrade-software" &&
            summary.status === "succeeded"
          ) {
            setTimeout(() => onUpgradeComplete?.(summary), 0);
          }
        }
        const next: Record<string, HostLroState> = {
          ...prev,
          [host_id]: {
            ...current,
            op_id,
            kind,
            summary,
            last_progress: updates.last_progress,
            last_event: updates.last_event,
          },
        };
        if (summary && isTerminal(summary.status)) {
          closeStream(op_id);
        }
        return next;
      });
    },
    [closeStream, onUpgradeComplete],
  );

  const updateFromStream = useCallback(
    (host_id: string, op_id: string) => {
      const stream = streamsRef.current.get(op_id);
      if (!stream) return;
      const events = stream.getAll();
      if (!events.length) return;
      applyEvents(host_id, op_id, events);
    },
    [applyEvents],
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
        stream.on("change", (event?: LroEvent) => {
          if (event) {
            applyEvents(host_id, op_id, [event]);
          } else {
            updateFromStream(host_id, op_id);
          }
        });
        stream.on("reset", () => updateFromStream(host_id, op_id));
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

  const refresh = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (lite) {
      return;
    }
    if (refreshInFlight.current) {
      return refreshInFlight.current;
    }
    const run = (async () => {
      const now = Date.now();
      const ids = hostIdsRef.current;
      const hostMeta = hostMetaRef.current;
      const activeHostIds = new Set(Object.keys(hostOpsRef.current));
      const candidates = hostMeta
        .filter((host) => {
          if (activeHostIds.has(host.id)) return true;
          if (host.last_action_status === "pending") return true;
          if (!host.status) return false;
          return TRANSITION_STATUSES.has(host.status);
        })
        .map((host) => host.id);
      const shouldFull =
        force || now - lastFullRefreshRef.current > HOST_LRO_FULL_REFRESH_MS;
      const idsToCheck = shouldFull ? ids : candidates;
      if (!idsToCheck.length) {
        return;
      }
      if (shouldFull) {
        lastFullRefreshRef.current = now;
      }
      const next: Record<string, HostLroState> = {};
      const activeOpIds = new Set<string>();
      await Promise.all(
        idsToCheck.map(async (id) => {
          try {
            const ops = await listLro({
              scope_type: "host",
              scope_id: id,
              include_completed: false,
            });
            const hostOps = ops.filter(
              (op) => op.kind?.startsWith("host-") && !isDismissed(op),
            );
            if (!hostOps.length) {
              return;
            }
            const latest = hostOps.sort((a, b) => toTime(b) - toTime(a))[0];
            if (!latest) return;
            next[id] = {
              op_id: latest.op_id,
              summary: latest,
              kind: latest.kind,
            };
            activeOpIds.add(latest.op_id);
            await ensureStream(id, latest.op_id, latest.scope_id);
          } catch (err) {
            console.warn("unable to refresh host operations", { id, err });
          }
        }),
      );
      setHostOps((prev) => {
        const merged: Record<string, HostLroState> = {};
        for (const [hostId, entry] of Object.entries(next)) {
          const previous = prev[hostId];
          if (previous && previous.op_id === entry.op_id) {
            merged[hostId] = {
              ...entry,
              last_progress: previous.last_progress ?? entry.last_progress,
              last_event: previous.last_event ?? entry.last_event,
              kind: entry.kind ?? previous.kind,
            };
          } else {
            merged[hostId] = entry;
          }
        }
        return merged;
      });
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
    if (lite) {
      return;
    }
    hostIdsRef.current = hosts
      .filter((host) => !host.deleted)
      .map((host) => host.id);
    hostMetaRef.current = hosts
      .filter((host) => !host.deleted)
      .map((host) => ({
        id: host.id,
        status: host.status,
        last_action_status: host.last_action_status ?? null,
      }));
    refresh().catch(() => {});
  }, [hosts, refresh]);

  useEffect(() => {
    hostOpsRef.current = hostOps;
  }, [hostOps]);

  useEffect(() => {
    if (lite) {
      return;
    }
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
      if (lite) {
        return;
      }
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

  return { hostOps, trackHostOp, refresh };
}

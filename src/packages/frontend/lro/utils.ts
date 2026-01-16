import type {
  LroEvent,
  LroStatus,
  LroSummary,
} from "@cocalc/conat/hub/api/lro";

export type LroOpState = {
  op_id: string;
  summary?: LroSummary;
  last_progress?: Extract<LroEvent, { type: "progress" }>;
  last_event?: LroEvent;
};

export const LRO_TERMINAL_STATUSES = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export const LRO_DISMISSABLE_STATUSES = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export function isTerminal(status?: LroStatus): boolean {
  return !!status && LRO_TERMINAL_STATUSES.has(status);
}

export function isDismissed(summary?: LroSummary): boolean {
  return summary?.dismissed_at != null;
}

export function progressBarStatus(
  status?: LroStatus,
): "active" | "exception" | "success" {
  if (status === "failed" || status === "canceled" || status === "expired") {
    return "exception";
  }
  if (status === "succeeded") {
    return "success";
  }
  return "active";
}

export function toTime(summary: LroSummary): number {
  const candidate =
    summary.updated_at ?? summary.started_at ?? summary.created_at;
  const date = new Date(candidate as any);
  const ts = date.getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function applyLroEvents({
  events,
  summary,
  last_progress,
  last_event,
}: {
  events: LroEvent[];
  summary?: LroSummary;
  last_progress?: Extract<LroEvent, { type: "progress" }>;
  last_event?: LroEvent;
}): Pick<LroOpState, "summary" | "last_progress" | "last_event"> {
  let nextSummary = summary;
  let nextProgress = last_progress;
  let nextEvent = last_event;
  let lastProgressTs = nextProgress?.ts ?? -1;
  let lastEventTs = nextEvent?.ts ?? -1;
  let lastSummaryTs = -1;
  for (const event of events) {
    if (event.type === "summary") {
      if (event.ts >= lastSummaryTs) {
        nextSummary = event.summary;
        lastSummaryTs = event.ts;
      }
    } else if (event.type === "progress") {
      if (event.ts >= lastProgressTs) {
        nextProgress = event;
        lastProgressTs = event.ts;
      }
    }
    if (event.ts >= lastEventTs) {
      nextEvent = event;
      lastEventTs = event.ts;
    }
  }
  return {
    summary: nextSummary,
    last_progress: nextProgress,
    last_event: nextEvent,
  };
}

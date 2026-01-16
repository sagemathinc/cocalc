/**
 * Move-ops LRO UI state manager: tracks the active project-move operation
 * and keeps the UI synced via LRO streams (see docs/long-running-operations.md).
 */
import { Map as ImmutableMap } from "immutable";
import type { DStream } from "@cocalc/conat/sync/dstream";
import type {
  LroEvent,
  LroStatus,
  LroSummary,
} from "@cocalc/conat/hub/api/lro";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

const MOVE_LRO_KIND = "project-move";
const MOVE_LRO_REFRESH_MS = 30_000;
const MOVE_LRO_TERMINAL = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

export type MoveLroState = {
  op_id: string;
  summary?: LroSummary;
  last_progress?: Extract<LroEvent, { type: "progress" }>;
  last_event?: LroEvent;
};

export type MoveOpsManagerOptions = {
  project_id: string;
  setState: (state: { move_lro?: ImmutableMap<string, any> }) => void;
  isClosed: () => boolean;
  listLro: (opts: {
    scope_type: "project";
    scope_id: string;
    include_completed?: boolean;
  }) => Promise<LroSummary[]>;
  getLroStream: (opts: {
    op_id: string;
    scope_type: LroSummary["scope_type"];
    scope_id: string;
  }) => Promise<DStream<LroEvent>>;
  log?: (message: string, err?: unknown) => void;
};

export class MoveOpsManager {
  private initialized = false;
  private refreshTimer?: number;
  private stream?: DStream<LroEvent>;
  private streamInit?: Promise<void>;
  private currentOpId?: string;
  private state?: MoveLroState;

  constructor(private opts: MoveOpsManagerOptions) {}

  init = () => {
    if (this.initialized || this.opts.isClosed()) {
      return;
    }
    this.initialized = true;
    this.refresh().catch((err) => {
      this.log("unable to refresh move operations", err);
    });
    this.refreshTimer = window.setInterval(() => {
      this.refresh().catch((err) => {
        this.log("unable to refresh move operations", err);
      });
    }, MOVE_LRO_REFRESH_MS);
  };

  close = () => {
    if (!this.initialized) {
      return;
    }
    this.initialized = false;
    if (this.refreshTimer != null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.closeStream();
    this.state = undefined;
    this.opts.setState({ move_lro: undefined });
  };

  track = (op: {
    op_id?: string;
    scope_type?: LroSummary["scope_type"];
    scope_id?: string;
  }) => {
    if (!op?.op_id || !op.scope_type) {
      return;
    }
    this.init();
    if (this.currentOpId && this.currentOpId !== op.op_id) {
      this.closeStream();
    }
    this.currentOpId = op.op_id;
    if (!this.state || this.state.op_id !== op.op_id) {
      this.setState({ op_id: op.op_id });
    }
    this.ensureStream({
      op_id: op.op_id,
      scope_type: op.scope_type,
      scope_id: op.scope_id ?? this.opts.project_id,
    });
  };

  private refresh = reuseInFlight(async () => {
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const ops = await this.opts.listLro({
      scope_type: "project",
      scope_id: this.opts.project_id,
      include_completed: true,
    });
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const moveOps = ops.filter((op) => op.kind === MOVE_LRO_KIND);
    if (!moveOps.length) {
      this.closeStream();
      this.state = undefined;
      this.opts.setState({ move_lro: undefined });
      return;
    }
    const latest = moveOps.sort((a, b) => this.toTime(b) - this.toTime(a))[0];
    if (!latest) {
      return;
    }
    if (latest.status === "succeeded") {
      this.closeStream();
      this.state = undefined;
      this.opts.setState({ move_lro: undefined });
      return;
    }
    if (this.currentOpId && this.currentOpId !== latest.op_id) {
      this.closeStream();
    }
    this.currentOpId = latest.op_id;
    const next: MoveLroState = {
      ...(this.state ?? { op_id: latest.op_id }),
      op_id: latest.op_id,
      summary: latest,
    };
    this.setState(next);
    if (!MOVE_LRO_TERMINAL.has(latest.status)) {
      this.ensureStream({
        op_id: latest.op_id,
        scope_type: latest.scope_type,
        scope_id: latest.scope_id,
      });
    } else {
      this.closeStream();
    }
  });

  private ensureStream = ({
    op_id,
    scope_type,
    scope_id,
  }: {
    op_id: string;
    scope_type: LroSummary["scope_type"];
    scope_id: string;
  }) => {
    if (this.currentOpId !== op_id) {
      return;
    }
    if (this.stream || this.streamInit) {
      return;
    }
    const init = (async () => {
      const stream = await this.opts.getLroStream({
        op_id,
        scope_type,
        scope_id,
      });
      if (!this.initialized || this.opts.isClosed() || this.currentOpId !== op_id) {
        stream.close();
        return;
      }
      this.stream = stream;
      stream.on("change", this.updateFromStream);
      this.updateFromStream();
    })().catch((err) => {
      this.log("unable to subscribe to move operation", { op_id, err });
    });
    this.streamInit = init;
    init.finally(() => {
      if (this.streamInit === init) {
        this.streamInit = undefined;
      }
    });
  };

  private updateFromStream = () => {
    if (!this.stream || !this.currentOpId) {
      return;
    }
    const events = this.stream.getAll();
    if (!events.length) {
      return;
    }
    let summary = this.state?.summary;
    let lastProgress: Extract<LroEvent, { type: "progress" }> | undefined;
    for (const event of events) {
      if (event.type === "summary") {
        summary = event.summary;
      } else if (event.type === "progress") {
        lastProgress = event;
      }
    }
    const lastEvent = events[events.length - 1];
    const next: MoveLroState = {
      ...(this.state ?? { op_id: this.currentOpId }),
      op_id: this.currentOpId,
      summary,
      last_progress: lastProgress,
      last_event: lastEvent,
    };
    this.setState(next);
    if (summary && MOVE_LRO_TERMINAL.has(summary.status)) {
      this.closeStream();
    }
  };

  private closeStream() {
    if (this.stream) {
      this.stream.close();
    }
    this.stream = undefined;
    this.streamInit = undefined;
    this.currentOpId = undefined;
  }

  private setState(next: MoveLroState) {
    this.state = next;
    this.opts.setState({ move_lro: ImmutableMap(next) });
  }

  private toTime(summary: LroSummary): number {
    const candidate = summary.started_at ?? summary.created_at;
    if (!candidate) return 0;
    const date = new Date(candidate as any);
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }

  private log(message: string, err?: unknown) {
    if (this.opts.log) {
      this.opts.log(message, err);
      return;
    }
    if (err !== undefined) {
      console.warn(message, err);
    } else {
      console.warn(message);
    }
  }
}

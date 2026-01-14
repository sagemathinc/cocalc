/**
 * Copy-ops LRO UI state manager: tracks active copy-path operations for a project
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

const COPY_LRO_KIND = "copy-path-between-projects";
const COPY_LRO_REFRESH_MS = 30_000;
const COPY_LRO_TERMINAL = new Set<LroStatus>([
  "succeeded",
  "failed",
  "canceled",
  "expired",
]);

type CopyLroState = {
  op_id: string;
  summary?: LroSummary;
  last_progress?: Extract<LroEvent, { type: "progress" }>;
  last_event?: LroEvent;
};

export type CopyOpsManagerOptions = {
  project_id: string;
  setState: (state: { copy_ops?: ImmutableMap<string, CopyLroState> }) => void;
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

export class CopyOpsManager {
  private initialized = false;
  private refreshTimer?: number;
  private streams = new globalThis.Map<string, DStream<LroEvent>>();
  private streamInit = new globalThis.Map<string, Promise<void>>();
  private state: Record<string, CopyLroState> = {};

  constructor(private opts: CopyOpsManagerOptions) {}

  init = () => {
    if (this.initialized || this.opts.isClosed()) {
      return;
    }
    this.initialized = true;
    this.refresh().catch((err) => {
      this.log("unable to refresh copy operations", err);
    });
    this.refreshTimer = window.setInterval(() => {
      this.refresh().catch((err) => {
        this.log("unable to refresh copy operations", err);
      });
    }, COPY_LRO_REFRESH_MS);
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
    for (const stream of this.streams.values()) {
      stream.close();
    }
    this.streams.clear();
    this.streamInit.clear();
    this.state = {};
    this.opts.setState({ copy_ops: undefined });
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
    if (!this.state[op.op_id]) {
      this.setState({
        ...this.state,
        [op.op_id]: { op_id: op.op_id },
      });
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
      include_completed: false,
    });
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const copyOps = ops.filter((op) => op.kind === COPY_LRO_KIND);
    this.sync(copyOps);
  });

  private sync = (ops: LroSummary[]) => {
    const next: Record<string, CopyLroState> = {};
    for (const op of ops) {
      const prev = this.state[op.op_id] ?? { op_id: op.op_id };
      next[op.op_id] = { ...prev, summary: op };
      this.ensureStream({
        op_id: op.op_id,
        scope_type: op.scope_type,
        scope_id: op.scope_id,
      });
    }
    for (const op_id of Object.keys(this.state)) {
      if (!next[op_id]) {
        this.closeStream(op_id);
      }
    }
    this.setState(next);
  };

  private ensureStream = ({
    op_id,
    scope_type,
    scope_id,
  }: {
    op_id: string;
    scope_type: LroSummary["scope_type"];
    scope_id: string;
  }) => {
    if (this.streams.has(op_id) || this.streamInit.has(op_id)) {
      return;
    }
    const init = (async () => {
      const stream = await this.opts.getLroStream({
        op_id,
        scope_type,
        scope_id,
      });
      if (!this.initialized || this.opts.isClosed()) {
        stream.close();
        return;
      }
      stream.on("change", () => this.updateFromStream(op_id));
      this.streams.set(op_id, stream);
      this.updateFromStream(op_id);
    })().catch((err) => {
      this.log("unable to subscribe to copy operation", { op_id, err });
    });
    this.streamInit.set(op_id, init);
    init.finally(() => {
      this.streamInit.delete(op_id);
    });
  };

  private closeStream = (op_id: string) => {
    const stream = this.streams.get(op_id);
    if (stream) {
      stream.close();
    }
    this.streams.delete(op_id);
    this.streamInit.delete(op_id);
  };

  private updateFromStream = (op_id: string) => {
    const stream = this.streams.get(op_id);
    if (!stream) {
      return;
    }
    const events = stream.getAll();
    if (!events.length) {
      return;
    }
    let summary = this.state[op_id]?.summary;
    let lastProgress: Extract<LroEvent, { type: "progress" }> | undefined;
    for (const event of events) {
      if (event.type === "summary") {
        summary = event.summary;
      } else if (event.type === "progress") {
        lastProgress = event;
      }
    }
    const lastEvent = events[events.length - 1];
    const next = {
      ...this.state,
      [op_id]: {
        ...this.state[op_id],
        op_id,
        summary,
        last_progress: lastProgress,
        last_event: lastEvent,
      },
    };
    this.setState(next);
    if (summary && COPY_LRO_TERMINAL.has(summary.status)) {
      this.closeStream(op_id);
    }
  };

  private setState(next: Record<string, CopyLroState>) {
    this.state = next;
    this.opts.setState({ copy_ops: ImmutableMap(next) });
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

import type { DStream } from "@cocalc/conat/sync/dstream";
import type { LroEvent, LroSummary } from "@cocalc/conat/hub/api/lro";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import {
  applyLroEvents,
  isDismissed,
  isTerminal,
  type LroOpState,
  toTime,
} from "./utils";
import { lite } from "@cocalc/frontend/lite";

type BaseOptions = {
  kind: string;
  scope_type: LroSummary["scope_type"];
  scope_id: string;
  include_completed?: boolean;
  refreshMs?: number;
  retainTerminal?: boolean;
  listLro: (opts: {
    scope_type: LroSummary["scope_type"];
    scope_id: string;
    include_completed?: boolean;
  }) => Promise<LroSummary[]>;
  getLroStream: (opts: {
    op_id: string;
    scope_type: LroSummary["scope_type"];
    scope_id: string;
  }) => Promise<DStream<LroEvent>>;
  dismissLro: (opts: { op_id: string }) => Promise<void>;
  isClosed: () => boolean;
  log?: (message: string, err?: unknown) => void;
};

type SingleOptions = BaseOptions & {
  setState: (state?: LroOpState) => void;
};

type MultiOptions = BaseOptions & {
  setState: (state?: Record<string, LroOpState>) => void;
};

export class SingleLroOpsManager {
  private initialized = false;
  private refreshTimer?: number;
  private stream?: DStream<LroEvent>;
  private streamInit?: Promise<void>;
  private currentOpId?: string;
  private state?: LroOpState;

  constructor(private opts: SingleOptions) {}

  init = () => {
    if (lite) {
      this.clearState();
      return;
    }
    if (this.initialized || this.opts.isClosed()) {
      return;
    }
    this.initialized = true;
    this.refresh().catch((err) => {
      this.log("unable to refresh lro operation", err);
    });
    const refreshMs = this.opts.refreshMs ?? 30_000;
    this.refreshTimer = window.setInterval(() => {
      this.refresh().catch((err) => {
        this.log("unable to refresh lro operation", err);
      });
    }, refreshMs);
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
    this.opts.setState(undefined);
  };

  track = (op: {
    op_id?: string;
    scope_type?: LroSummary["scope_type"];
    scope_id?: string;
  }) => {
    if (lite) {
      return;
    }
    if (!op?.op_id) {
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
      scope_type: op.scope_type ?? this.opts.scope_type,
      scope_id: op.scope_id ?? this.opts.scope_id,
    });
  };

  dismiss = (op_id?: string) => {
    if (lite) {
      return;
    }
    const target = op_id ?? this.state?.op_id ?? this.currentOpId;
    if (!target) {
      return;
    }
    void this.opts
      .dismissLro({ op_id: target })
      .then(() => {
        this.clearState();
      })
      .catch((err) => {
        this.log("unable to dismiss lro operation", err);
        this.refresh().catch((refreshErr) => {
          this.log("unable to refresh lro operation", refreshErr);
        });
      });
  };

  private refresh = reuseInFlight(async () => {
    if (lite) {
      return;
    }
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const ops = await this.opts.listLro({
      scope_type: this.opts.scope_type,
      scope_id: this.opts.scope_id,
      include_completed: this.opts.include_completed,
    });
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const candidates = ops.filter(
      (op) => op.kind === this.opts.kind && !isDismissed(op),
    );
    if (!candidates.length) {
      this.clearState();
      return;
    }
    const latest = candidates.sort((a, b) => toTime(b) - toTime(a))[0];
    if (!latest) {
      return;
    }
    if (this.currentOpId && this.currentOpId !== latest.op_id) {
      this.closeStream();
    }
    this.currentOpId = latest.op_id;
    const next: LroOpState = {
      ...(this.state ?? { op_id: latest.op_id }),
      op_id: latest.op_id,
      summary: latest,
    };
    this.setState(next);
    if (!isTerminal(latest.status)) {
      this.ensureStream({
        op_id: latest.op_id,
        scope_type: latest.scope_type,
        scope_id: latest.scope_id,
      });
    } else {
      this.closeStream();
      if (!this.opts.retainTerminal) {
        this.clearState();
      }
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
    if (lite) {
      return;
    }
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
      if (
        !this.initialized ||
        this.opts.isClosed() ||
        this.currentOpId !== op_id
      ) {
        stream.close();
        return;
      }
      this.stream = stream;
      stream.on("change", this.updateFromStream);
      this.updateFromStream();
    })().catch((err) => {
      this.log("unable to subscribe to lro operation", { op_id, err });
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
    const updates = applyLroEvents({
      events,
      summary: this.state?.summary,
      last_progress: this.state?.last_progress,
      last_event: this.state?.last_event,
    });
    if (isDismissed(updates.summary)) {
      this.clearState();
      return;
    }
    const next: LroOpState = {
      ...(this.state ?? { op_id: this.currentOpId }),
      op_id: this.currentOpId,
      ...updates,
    };
    this.setState(next);
    if (updates.summary && isTerminal(updates.summary.status)) {
      this.closeStream();
      if (!this.opts.retainTerminal) {
        this.clearState();
      }
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

  private clearState() {
    this.closeStream();
    this.state = undefined;
    this.opts.setState(undefined);
  }

  private setState(next?: LroOpState) {
    this.state = next;
    this.opts.setState(next);
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

export class MultiLroOpsManager {
  private initialized = false;
  private refreshTimer?: number;
  private streams = new globalThis.Map<string, DStream<LroEvent>>();
  private streamInit = new globalThis.Map<string, Promise<void>>();
  private state: Record<string, LroOpState> = {};

  constructor(private opts: MultiOptions) {}

  init = () => {
    if (lite) {
      this.opts.setState(undefined);
      return;
    }
    if (this.initialized || this.opts.isClosed()) {
      return;
    }
    this.initialized = true;
    this.refresh().catch((err) => {
      this.log("unable to refresh lro operations", err);
    });
    const refreshMs = this.opts.refreshMs ?? 30_000;
    this.refreshTimer = window.setInterval(() => {
      this.refresh().catch((err) => {
        this.log("unable to refresh lro operations", err);
      });
    }, refreshMs);
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
    this.opts.setState(undefined);
  };

  track = (op: {
    op_id?: string;
    scope_type?: LroSummary["scope_type"];
    scope_id?: string;
  }) => {
    if (lite) {
      return;
    }
    if (!op?.op_id) {
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
      scope_type: op.scope_type ?? this.opts.scope_type,
      scope_id: op.scope_id ?? this.opts.scope_id,
    });
  };

  dismiss = (op_id?: string) => {
    if (lite) {
      return;
    }
    if (!op_id) {
      return;
    }
    void this.opts
      .dismissLro({ op_id })
      .then(() => {
        this.removeOp(op_id);
      })
      .catch((err) => {
        this.log("unable to dismiss lro operation", err);
        this.refresh().catch((refreshErr) => {
          this.log("unable to refresh lro operations", refreshErr);
        });
      });
  };

  private refresh = reuseInFlight(async () => {
    if (lite) {
      return;
    }
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const ops = await this.opts.listLro({
      scope_type: this.opts.scope_type,
      scope_id: this.opts.scope_id,
      include_completed: this.opts.include_completed,
    });
    if (!this.initialized || this.opts.isClosed()) {
      return;
    }
    const filtered = ops.filter(
      (op) => op.kind === this.opts.kind && !isDismissed(op),
    );
    this.sync(filtered);
  });

  private sync = (ops: LroSummary[]) => {
    const next: Record<string, LroOpState> = {};
    for (const op of ops) {
      if (!this.opts.retainTerminal && isTerminal(op.status)) {
        continue;
      }
      const prev = this.state[op.op_id] ?? { op_id: op.op_id };
      next[op.op_id] = { ...prev, summary: op };
      if (!isTerminal(op.status)) {
        this.ensureStream({
          op_id: op.op_id,
          scope_type: op.scope_type,
          scope_id: op.scope_id,
        });
      } else {
        this.closeStream(op.op_id);
      }
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
    if (lite) {
      return;
    }
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
      this.log("unable to subscribe to lro operation", { op_id, err });
    });
    this.streamInit.set(op_id, init);
    init.finally(() => {
      this.streamInit.delete(op_id);
    });
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
    const updates = applyLroEvents({
      events,
      summary: this.state[op_id]?.summary,
      last_progress: this.state[op_id]?.last_progress,
      last_event: this.state[op_id]?.last_event,
    });
    if (isDismissed(updates.summary)) {
      this.removeOp(op_id);
      return;
    }
    const next = {
      ...this.state,
      [op_id]: {
        ...this.state[op_id],
        op_id,
        ...updates,
      },
    };
    this.setState(next);
    if (updates.summary && isTerminal(updates.summary.status)) {
      this.closeStream(op_id);
      if (!this.opts.retainTerminal) {
        this.removeOp(op_id);
      }
    }
  };

  private removeOp(op_id: string) {
    const next = { ...this.state };
    delete next[op_id];
    this.closeStream(op_id);
    this.setState(next);
  }

  private closeStream(op_id: string) {
    const stream = this.streams.get(op_id);
    if (stream) {
      stream.close();
    }
    this.streams.delete(op_id);
    this.streamInit.delete(op_id);
  }

  private setState(next: Record<string, LroOpState>) {
    this.state = next;
    this.opts.setState(next);
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

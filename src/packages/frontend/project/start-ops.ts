/**
 * Start-ops LRO UI state manager: tracks the active project-start operation
 * and keeps the UI synced via LRO streams (see docs/long-running-operations.md).
 */
import { Map as ImmutableMap } from "immutable";
import type { DStream } from "@cocalc/conat/sync/dstream";
import type { LroEvent, LroSummary } from "@cocalc/conat/hub/api/lro";
import { SingleLroOpsManager } from "@cocalc/frontend/lro/ops-manager";
import type { LroOpState } from "@cocalc/frontend/lro/utils";

const START_LRO_KIND = "project-start";

export type StartLroState = LroOpState;

export type StartOpsManagerOptions = {
  project_id: string;
  setState: (state: { start_lro?: ImmutableMap<string, any> }) => void;
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
  dismissLro: (opts: { op_id: string }) => Promise<void>;
  log?: (message: string, err?: unknown) => void;
};

export class StartOpsManager {
  private manager: SingleLroOpsManager;

  constructor(opts: StartOpsManagerOptions) {
    this.manager = new SingleLroOpsManager({
      kind: START_LRO_KIND,
      scope_type: "project",
      scope_id: opts.project_id,
      include_completed: false,
      retainTerminal: false,
      refreshMs: 30_000,
      listLro: opts.listLro,
      getLroStream: opts.getLroStream,
      dismissLro: opts.dismissLro,
      isClosed: opts.isClosed,
      log: opts.log,
      setState: (state) =>
        opts.setState({ start_lro: state ? ImmutableMap(state) : undefined }),
    });
  }

  init = () => this.manager.init();
  close = () => this.manager.close();
  track = (op: {
    op_id?: string;
    scope_type?: LroSummary["scope_type"];
    scope_id?: string;
  }) => this.manager.track(op);
  dismiss = (op_id?: string) => this.manager.dismiss(op_id);
}

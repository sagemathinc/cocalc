/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Coordinate build lifecycle across all clients via an ephemeral DKV.

One DKV per project, keyed by file path. Stores the current build state
so late joiners (clients that open the file mid-build) can tune in to
the running build immediately.

State machine:
  (no entry)  → "running"   = build started
  "running"   → "stopping"  = stop requested
  any         → (deleted)   = build finished

The coordinator also manages the join lifecycle: when a remote build is
detected, it calls the provided `join` callback and handles the state
transitions (is_building, building UI state) uniformly.  This eliminates
duplicated handler code in the LaTeX and RMD/QMD action classes.
*/

import { dkv, type DKV } from "@cocalc/conat/sync/dkv";

interface BuildState {
  buildId: string;
  status: "running" | "stopping";
  aggregate?: number;
  force?: boolean;
}

export interface BuildCoordinatorCallbacks {
  /** Format-specific build function called when joining a remote build. */
  join: (aggregate: number | undefined, force: boolean) => Promise<void>;
  /** Stop the current build process (kill PIDs, etc.). */
  stop: () => void;
  /** Query whether a build is currently running. */
  isBuilding: () => boolean;
  /** Set the building state (both internal flag and Redux store). */
  setBuilding: (building: boolean) => void;
  /** Report an error to the user. */
  setError: (err: string) => void;
}

export class BuildCoordinator {
  private dkv?: DKV<BuildState>;
  private path: string;
  private closed = false;
  private changeHandler?: (event: {
    key: string;
    value: any;
    prev: any;
  }) => void;
  private callbacks: BuildCoordinatorCallbacks;

  // Build tracking state — managed here to avoid duplication in consumers.
  private _remoteBuildId?: string;
  private _localBuildId?: string;

  // Operations buffered while DKV is still initializing.
  // Flushed in init() once the DKV is ready.  Set to undefined
  // after init completes (success or failure) so later calls
  // fall through to the dkv?.method() no-op path instead of
  // accumulating closures indefinitely.
  private pendingOps?: Array<() => void> = [];

  constructor(
    project_id: string,
    path: string,
    callbacks: BuildCoordinatorCallbacks,
  ) {
    this.path = path;
    this.callbacks = callbacks;
    this.init(project_id);
  }

  private async init(project_id: string) {
    try {
      const store = await dkv<BuildState>({
        project_id,
        name: "build",
        ephemeral: true,
      });
      if (this.closed) {
        store.close();
        return;
      }
      this.dkv = store;

      // Guard against close() racing with init()
      if (this.closed) return;

      // Subscribe to changes BEFORE reading initial state so we cannot
      // miss a build-start that arrives between snapshot and subscribe.
      this.changeHandler = ({ key, value, prev }) => {
        if (key !== this.path) return;

        if (value?.status === "running" && prev?.status !== "running") {
          this.handleBuildStart(value);
        } else if (value?.status === "stopping") {
          this.handleBuildStop();
        } else if (!value && prev) {
          this.handleBuildFinished(prev.buildId);
        }
      };
      this.dkv.on("change", this.changeHandler);

      // Late joiner: if a build is already running, join it.
      // Safe after subscribe — duplicate joins are guarded by isBuilding().
      const current = this.dkv.get(this.path);
      if (current?.status === "running") {
        this.handleBuildStart(current);
      }

      // Flush any operations that were buffered while DKV was initializing
      // (e.g., user clicked Build before DKV connected).
      if (this.pendingOps) {
        for (const op of this.pendingOps) {
          op();
        }
      }
      this.pendingOps = undefined;
    } catch (err) {
      console.warn("BuildCoordinator: failed to init DKV", err);
      // DKV failed — discard buffered ops and disable further buffering
      // so later calls fall through to the dkv?.method() no-op path.
      this.pendingOps = undefined;
    }
  }

  // -- Event handlers (replace duplicated code in LaTeX/RMD/QMD actions) --

  private handleBuildStart(state: BuildState): void {
    const { buildId, aggregate, force } = state;
    if (!this.callbacks.isBuilding() && buildId !== this._localBuildId) {
      this._remoteBuildId = buildId;
      void this.joinBuild(aggregate, force);
    }
  }

  private handleBuildFinished(buildId: string): void {
    if (buildId === this._remoteBuildId) {
      this._remoteBuildId = undefined;
      this.callbacks.setBuilding(false);
    }
    // Clear _localBuildId on the delete echo so self-echoes of
    // "running" that arrive before the delete are still recognized.
    if (buildId === this._localBuildId) {
      this._localBuildId = undefined;
    }
  }

  private handleBuildStop(): void {
    // Honor stop requests from any client (including echo from self).
    // Echo re-entry is prevented by publishBuildStop's own guard
    // (only transitions "running" → "stopping", never re-publishes).
    // The stop callback is idempotent (killing an already-killed PID is a no-op).
    if (this.callbacks.isBuilding()) {
      this.callbacks.stop();
    }
  }

  private async joinBuild(
    aggregate: number | undefined,
    force?: boolean,
  ): Promise<void> {
    if (this.callbacks.isBuilding()) return;
    this.callbacks.setBuilding(true);
    try {
      await this.callbacks.join(aggregate, force ?? false);
    } catch (err) {
      this.callbacks.setError(`${err}`);
    } finally {
      this.callbacks.setBuilding(false);
      // Note: we intentionally do NOT clean up the DKV entry here if the
      // originator crashed mid-build. Doing so risks prematurely deleting
      // a live entry when the joiner simply finishes faster. Stale entries
      // from crashed originators are handled by the ephemeral DKV's TTL.
      // V2 will coordinate via the project backend for definitive cleanup.
    }
  }

  // -- Public API for initiator builds (called from build() / stop_build()) --

  /**
   * Register a local build ID before publishing to the DKV.
   * Must be called synchronously before publishBuildStart so the
   * DKV self-echo is recognized and filtered out.
   */
  setLocalBuildId(buildId: string): void {
    this._localBuildId = buildId;
  }

  /** Announce a build start to all clients via DKV. */
  publishBuildStart(
    buildId: string,
    aggregate: number | undefined,
    force?: boolean,
  ): void {
    const doPublish = () => {
      this.dkv?.set(this.path, {
        buildId,
        status: "running",
        aggregate,
        force,
      });
    };
    if (this.dkv) {
      doPublish();
    } else {
      this.pendingOps?.push(doPublish);
    }
  }

  /** Announce build completion and clear the DKV entry. */
  publishBuildFinished(buildId: string): void {
    const doPublish = () => {
      // Only delete if the current entry matches our buildId — prevents
      // a finishing client from deleting another client's concurrent build.
      const current = this.dkv?.get(this.path);
      if (!current) {
        // Entry already gone (or was never written) — deleting a
        // non-existent key is a no-op that produces no echo, so
        // clear _localBuildId immediately.
        if (this._localBuildId === buildId) {
          this._localBuildId = undefined;
        }
      } else if (current.buildId === buildId) {
        this.dkv?.delete(this.path);
        // _localBuildId cleared by handleBuildFinished when delete
        // echo arrives.  The echo is guaranteed here because we're
        // deleting an existing key (current is non-null).
      } else {
        // Another client's build overwrote the entry — no delete echo will
        // arrive, so clear _localBuildId now.
        if (this._localBuildId === buildId) {
          this._localBuildId = undefined;
        }
      }
    };
    if (this.dkv) {
      doPublish();
    } else if (this.pendingOps) {
      // Build finished while DKV was still initializing.  Only clear
      // the buffer if no newer build has started — a force-rebuild may
      // have already pushed its own start op that we must preserve.
      if (this._localBuildId === buildId) {
        // No newer build — the buffered start + finish pair is stale.
        this.pendingOps.length = 0;
        this._localBuildId = undefined;
      }
      // else: a newer build overwrote _localBuildId.  Leave the buffer
      // intact so the newer build's start op flushes when DKV inits.
      // The stale start(A) is harmless — start(B) will overwrite it.
    } else {
      // DKV init failed, no buffer — clear immediately.
      if (this._localBuildId === buildId) {
        this._localBuildId = undefined;
      }
    }
  }

  /** Request all clients to stop the current build. */
  requestStop(): void {
    const idToStop = this._localBuildId ?? this._remoteBuildId;
    if (!idToStop) return;
    const doPublish = () => {
      const current = this.dkv?.get(this.path);
      if (current?.status === "running" && current.buildId === idToStop) {
        this.dkv?.set(this.path, { ...current, status: "stopping" });
      }
    };
    if (this.dkv) {
      doPublish();
    } else {
      this.pendingOps?.push(doPublish);
    }
  }

  close(): void {
    this.closed = true;
    // Detach change listener before closing the ref-counted DKV.
    // The DKV may stay alive if other editors in the same project
    // still hold references — without this, stale listeners accumulate.
    if (this.changeHandler && this.dkv) {
      this.dkv.off("change", this.changeHandler);
      this.changeHandler = undefined;
    }
    this.dkv?.close();
  }
}

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
  any         → "finished"  = build finished

The coordinator also manages the join lifecycle: when a remote build is
detected, it calls the provided `join` callback and handles the state
transitions (is_building, building UI state) uniformly.  This eliminates
duplicated handler code in the LaTeX and RMD/QMD action classes.
*/

import { dkv, type DKV } from "@cocalc/conat/sync/dkv";

interface BuildState {
  buildId: string;
  status: "running" | "stopping" | "finished";
  aggregate?: number;
  force?: boolean;
  /**
   * Wall-clock ms when this state was written. Used by late joiners to
   * detect stranded "running" entries (originator crashed / stream lost
   * its "done" event) instead of joining and hanging forever.
   * Optional for backwards compatibility with older clients.
   */
  startedAt?: number;
}

/**
 * Maximum age of a "running" DKV entry we're willing to join as a late
 * joiner. The latex backend enforces a 15-minute hard timeout on the job
 * itself; anything older than that plus a generous safety margin is
 * definitely stranded (the originator's `publishBuildFinished` never ran)
 * and re-joining would just hang us the same way.
 */
const STALE_RUNNING_ENTRY_MS = 20 * 60 * 1000;

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
    value: BuildState | undefined;
    prev: BuildState | undefined;
  }) => void;
  private callbacks: BuildCoordinatorCallbacks;

  // Build tracking state — managed here to avoid duplication in consumers.
  private _remoteBuildId?: string;
  private _localBuildId?: string;
  // True while joinBuild() is awaiting the join callback.  Prevents
  // handleBuildFinished from clearing building state prematurely when
  // the originator finishes before our local join() completes.
  private _joining = false;

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

      // Subscribe to changes BEFORE reading initial state so we cannot
      // miss a build-start that arrives between snapshot and subscribe.
      this.changeHandler = ({ key, value, prev }) => {
        if (key !== this.path) return;

        if (
          value?.status === "running" &&
          (prev?.status !== "running" || value.buildId !== prev.buildId)
        ) {
          this.handleBuildStart(value);
        } else if (value?.status === "stopping") {
          this.handleBuildStop(value.buildId);
        } else if (value?.status === "finished") {
          this.handleBuildFinished(value.buildId);
        } else if (!value && prev) {
          // Backwards compatibility: older clients used delete as the
          // terminal transition. Keep honoring that if we see it.
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
      this.callbacks.setError(
        "BuildCoordinator: failed to initialize coordination — builds will work but won't sync across tabs",
      );
      // DKV failed — discard buffered ops and disable further buffering
      // so later calls fall through to the dkv?.method() no-op path.
      this.pendingOps = undefined;
    }
  }

  // -- Event handlers (replace duplicated code in LaTeX/RMD/QMD actions) --

  private handleBuildStart(state: BuildState): void {
    const { buildId, aggregate, force, startedAt } = state;
    if (this.callbacks.isBuilding() || buildId === this._localBuildId) {
      return;
    }
    // Stranded-entry protection: if an entry claims to be "running" for
    // longer than the backend could possibly have kept the job alive,
    // the originator must have died without publishing "finished".
    // Joining would re-run the same hang. Treat the entry as terminal,
    // publish "finished" so peers clear too, and skip the join.
    if (
      typeof startedAt === "number" &&
      Date.now() - startedAt > STALE_RUNNING_ENTRY_MS
    ) {
      console.warn(
        `BuildCoordinator: ignoring stale "running" DKV entry for ${this.path} (age=${Math.round((Date.now() - startedAt) / 1000)}s, buildId=${buildId})`,
      );
      this.dkv?.set(this.path, { ...state, status: "finished" });
      return;
    }
    this._remoteBuildId = buildId;
    void this.joinBuild(aggregate, force);
  }

  private handleBuildFinished(buildId: string): void {
    if (buildId === this._remoteBuildId) {
      this._remoteBuildId = undefined;
      // If joinBuild() is still awaiting join(), let its finally block
      // handle setBuilding(false).  Clearing it here would allow a new
      // handleBuildStart to launch a concurrent joinBuild, causing
      // overlapping compiles and inconsistent state.
      if (!this._joining) {
        this.callbacks.setBuilding(false);
      }
    }
    // Clear _localBuildId on the delete echo so self-echoes of
    // "running" that arrive before the delete are still recognized.
    if (buildId === this._localBuildId) {
      this._localBuildId = undefined;
    }
  }

  private handleBuildStop(buildId: string): void {
    // Honor stop requests from any client (including echo from self).
    // Only stop if this stop event matches the build we currently track.
    // This prevents stale "stopping" events from a previous build from
    // canceling a newer build that started shortly afterwards.
    const isCurrentBuild =
      buildId === this._localBuildId || buildId === this._remoteBuildId;
    if (isCurrentBuild && this.callbacks.isBuilding()) {
      this.callbacks.stop();
    }
  }

  private async joinBuild(
    aggregate: number | undefined,
    force?: boolean,
  ): Promise<void> {
    if (this.callbacks.isBuilding()) return;
    this._joining = true;
    this.callbacks.setBuilding(true);
    try {
      await this.callbacks.join(aggregate, force ?? false);
    } catch (err) {
      this.callbacks.setError(`${err}`);
    } finally {
      this._joining = false;
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
    const startedAt = Date.now();
    const doPublish = () => {
      this.dkv?.set(this.path, {
        buildId,
        status: "running",
        aggregate,
        force,
        startedAt,
      });
    };
    if (this.dkv) {
      doPublish();
    } else {
      this.pendingOps?.push(doPublish);
    }
  }

  /** Announce build completion. */
  publishBuildFinished(buildId: string): void {
    const doPublish = () => {
      // Only publish "finished" if the current entry matches our buildId —
      // prevents a finishing client from clobbering another client's newer build.
      //
      // IMPORTANT: on ephemeral DKV streams, connected clients may not observe
      // deletes. Use a visible terminal state instead of relying on delete.
      const current = this.dkv?.get(this.path);
      if (!current) {
        // Entry already gone (or was never written) — no self-echo will arrive, so
        // clear _localBuildId immediately.
        if (this._localBuildId === buildId) {
          this._localBuildId = undefined;
        }
      } else if (current.buildId === buildId) {
        this.dkv?.set(this.path, { ...current, status: "finished" });
        // _localBuildId is cleared by handleBuildFinished when the
        // self-echo of "finished" arrives.
      } else {
        // Another client's build overwrote the entry — no self-echo will
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
    const dkv = this.dkv;
    this.dkv = undefined;
    if (this.changeHandler && dkv) {
      dkv.off("change", this.changeHandler);
      this.changeHandler = undefined;
    }
    dkv?.close();
  }
}

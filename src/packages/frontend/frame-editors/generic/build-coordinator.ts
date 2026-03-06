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
*/

import { EventEmitter } from "events";

import { dkv, type DKV } from "@cocalc/conat/sync/dkv";

interface BuildState {
  buildId: string;
  status: "running" | "stopping";
  aggregate?: number;
  force?: boolean;
}

export class BuildCoordinator extends EventEmitter {
  private dkv?: DKV<BuildState>;
  private path: string;
  private closed = false;
  private changeHandler?: (event: {
    key: string;
    value: any;
    prev: any;
  }) => void;

  constructor(project_id: string, path: string) {
    super();
    this.path = path;
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

      // Late joiner: if a build is already running, emit build-start
      const current = this.dkv.get(this.path);
      if (current?.status === "running") {
        this.emit("build-start", {
          buildId: current.buildId,
          aggregate: current.aggregate,
          force: current.force,
        });
      }

      // Guard against close() racing with init()
      if (this.closed) return;

      // Listen for state changes from other clients.
      // Store the handler so close() can detach it even when the
      // ref-counted DKV stays alive (other editors in the same project).
      this.changeHandler = ({ key, value, prev }) => {
        if (key !== this.path) return;

        if (value?.status === "running" && prev?.status !== "running") {
          this.emit("build-start", {
            buildId: value.buildId,
            aggregate: value.aggregate,
            force: value.force,
          });
        } else if (value?.status === "stopping") {
          this.emit("build-stop", { buildId: value.buildId });
        } else if (!value && prev) {
          this.emit("build-finished", { buildId: prev.buildId });
        }
      };
      this.dkv.on("change", this.changeHandler);
    } catch (err) {
      console.warn("BuildCoordinator: failed to init DKV", err);
    }
  }

  publishBuildStart(
    buildId: string,
    aggregate: number | undefined,
    force?: boolean,
  ): void {
    this.dkv?.set(this.path, {
      buildId,
      status: "running",
      aggregate,
      force,
    });
  }

  publishBuildFinished(buildId: string): void {
    // Only delete if the current entry matches our buildId — prevents
    // a finishing client from deleting another client's concurrent build.
    const current = this.dkv?.get(this.path);
    if (!current || current.buildId === buildId) {
      this.dkv?.delete(this.path);
    }
  }

  publishBuildStop(buildId: string): void {
    const current = this.dkv?.get(this.path);
    if (current?.status === "running" && current.buildId === buildId) {
      this.dkv?.set(this.path, { ...current, status: "stopping" });
    }
  }

  close(): void {
    this.closed = true;
    this.removeAllListeners();
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

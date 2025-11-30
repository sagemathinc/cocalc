/*
Centralized merge helper for CodeMirror-based editors.
Keeps track of the last merged base/version and performs 3-way merges
between the base, current local buffer, and incoming remote value.
*/

import { threeWayMerge } from "@cocalc/sync";

export interface MergeCoordinatorOpts {
  getLocal: () => string | undefined;
  applyMerged: (merged: string) => void;
}

export class MergeCoordinator {
  private baseValue?: string;
  private baseVersion?: number;

  constructor(private opts: MergeCoordinatorOpts) {}

  seedBase(value: string, version?: number): void {
    this.baseValue = value;
    this.baseVersion = version;
  }

  recordLocalCommit(value: string, version?: number): void {
    this.baseValue = value;
    if (version !== undefined) {
      this.baseVersion = version;
    }
  }

  mergeRemote(remoteValue: string, version?: number): string {
    const base = this.baseValue ?? remoteValue;
    const local = this.opts.getLocal() ?? base;
    const merged = threeWayMerge({ base, local, remote: remoteValue });
    this.baseValue = merged;
    if (version !== undefined) {
      this.baseVersion = version;
    }
    this.opts.applyMerged(merged);
    return merged;
  }

  getBaseValue(): string | undefined {
    return this.baseValue;
  }

  getBaseVersion(): number | undefined {
    return this.baseVersion;
  }
}

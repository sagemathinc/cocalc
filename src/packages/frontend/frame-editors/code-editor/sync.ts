/*
Centralized merge helper for CodeMirror-based editors.
Keeps track of the last upstream base/version and performs 3-way merges
between that base, the current local buffer, and incoming remote value.
*/

import { threeWayMerge, type PatchId } from "@cocalc/sync";

export interface MergeCoordinatorOpts {
  getLocal: () => string | undefined;
  applyMerged: (merged: string) => void;
}

export class MergeCoordinator {
  private baseValue?: string;
  private baseVersion?: PatchId;

  constructor(private opts: MergeCoordinatorOpts) {}

  seedBase(value: string, version?: PatchId): void {
    this.baseValue = value;
    this.baseVersion = version;
  }

  recordLocalCommit(value: string, version?: PatchId): void {
    this.baseValue = value;
    if (version !== undefined) {
      this.baseVersion = version;
    }
  }

  mergeRemote(
    remoteValue: string,
    version?: PatchId,
    localOverride?: string,
  ): string {
    const base = this.baseValue ?? remoteValue;
    const local = localOverride ?? this.opts.getLocal() ?? base;
    const merged = threeWayMerge({ base, local, remote: remoteValue });
    // Keep the base anchored to upstream/remote for future merges, even if
    // merged contains uncommitted local edits.
    this.baseValue = remoteValue;
    if (version !== undefined) {
      this.baseVersion = version;
    }
    this.opts.applyMerged(merged);
    return merged;
  }

  getBaseValue(): string | undefined {
    return this.baseValue;
  }

  getBaseVersion(): PatchId | undefined {
    return this.baseVersion;
  }
}

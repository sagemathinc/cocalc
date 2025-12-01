/*
 * Lightweight merge helper for single-value inputs (textarea, markdown editor, etc.)
 * that need to preserve local edits when remote updates arrive.
 *
 * Usage:
 *   const merger = new SimpleInputMerge(initialValue);
 *   // on remote change (newValue):
 *   merger.handleRemote({
 *     remote: newValue,
 *     getLocal: () => currentInputValue,
 *     applyMerged: (v) => setInputValue(v),
 *   });
 *   // when a value is saved/committed:
 *   merger.noteSaved(currentInputValue);
 *
 * Algorithm:
 * - Track `last` as the reconciled baseline.
 * - If the live buffer equals `last`, adopt remote and bump `last`.
 * - If the live buffer diverged, compute a patch from `last → local`, apply it to
 *   `remote`, set `last` to the merged value, and only overwrite the buffer when
 *   it differs. No explicit echo suppression needed.
 */
import { applyPatch, makePatch } from "patchflow";

type Getter = () => string;
type Setter = (value: string) => void;

export class SimpleInputMerge {
  private last: string;

  constructor(initialValue: string) {
    this.last = initialValue ?? "";
  }

  // Reset the baseline (e.g., when switching documents).
  public reset(value: string): void {
    // console.log("reset", { value });
    this.last = value ?? "";
  }

  // Mark that the current value has been saved/committed.
  public noteSaved(value: string): void {
    // console.log("noteSaved", { value });
    this.last = value ?? this.last;
  }

  // Merge an incoming remote value with the current local buffer.
  public handleRemote(opts: {
    remote: string;
    getLocal: Getter;
    applyMerged: Setter;
  }): void {
    const remote = opts.remote ?? "";
    const local = opts.getLocal() ?? "";
    // console.log("handleRemote", { remote, local, last: this.last });

    // No local edits since last baseline: adopt remote directly.
    if (local === this.last) {
      this.last = remote;
      if (remote !== local) {
        opts.applyMerged(remote);
      }
      return;
    }

    // Local diverged: rebase local delta onto remote.
    const delta = makePatch(this.last, local);
    const [merged] = applyPatch(delta, remote);
    this.last = merged;
    if (merged !== local) {
      opts.applyMerged(merged);
    }
  }
}

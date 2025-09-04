/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sorted list of patches applied to a starting string/object.
*/

import { EventEmitter } from "events";
import { Document, Patch } from "./types";
import { patch_cmp } from "./util";
import { close, deep_copy, trunc_middle } from "@cocalc/util/misc";
import { isEqual } from "lodash";
import LRU from "lru-cache";

const MAX_PATCHLIST_CACHE_SIZE = 100;
const FILE_TIME_DEDUP_TOLERANCE = 3000;

export class SortedPatchList extends EventEmitter {
  private from_str: (s: string) => Document;
  //private loadMoreHistory?: () => Promise<boolean>;

  private patches: Patch[] = [];

  // Messages that we have NOT yet merged into our pristine and
  // always valid this.live.
  private heldSnapshots: { [time: number]: Patch } = {};
  private staging: { [time: number]: Patch } = {};

  // this.live = All patches indexed by time that we consider when defining the
  // current state of the document.  Any code changing this.live can only
  // add new patches to it (or modify a patch to be a snapshot) and must
  // *always* synchronously leave it having the following property:
  //     Property: all tails are snapshots.
  // This property ensures that it is possible to meaningfully define
  // an immutable value at every key of this.live.
  private live: { [time: number]: Patch } = {};

  // max of all times that have been adding to this patch list, even those in staging.
  private maxTime = 0;

  public fileTimeDedupTolerance = FILE_TIME_DEDUP_TOLERANCE;

  private versions_cache: number[] | undefined;

  // should we use size?  most versions have the same size, so might not matter much.
  private cache: LRU<number, { doc: Document; numTimes: number }> = new LRU({
    max: MAX_PATCHLIST_CACHE_SIZE,
  });

  private oldestSnapshot?: Patch;

  constructor({
    from_str,
    // loadMoreHistory,
  }: {
    from_str: (s: string) => Document;
    //loadMoreHistory?: () => Promise<boolean>;
  }) {
    super();
    this.from_str = from_str;
    //this.loadMoreHistory = loadMoreHistory;
  }

  close = (): void => {
    this.removeAllListeners();
    this.cache.clear();
    close(this);
  };

  needsMoreHistory = () => {
    if (this.hasFullHistory()) {
      return false;
    }
    for (const _ in this.staging) {
      return true;
    }
  };

  hasFullHistory = () => {
    const p = this.patches[0];
    if (p == null) {
      // no patches
      for (const _ in this.staging) {
        return false;
      }
      // and nothing in staging
      return true;
    }
    // is p the first every patch?
    return !p.is_snapshot && (p.parents ?? []).length == 0;
  };

  lastVersion = () => {
    const n = this.patches.length;
    return this.patches[n - 1]?.version ?? n;
  };

  firstVersion = () => {
    return this.patches[0]?.version ?? 1;
  };

  versionNumber = (time: number): undefined | number => {
    return this.live[time]?.version;
  };

  /* Choose the next available time in ms that is congruent to
     m modulo n and is larger than any current times.
     This is a LOGICAL TIME; it does not have to equal the
     actual wall clock.  The key is that it is increasing.
     The congruence condition is so that any time
     collision would be with a single user editing a
     document with themselves -- two different users are
     guaranteed to not collide.  Note: even if there is a
     collision, it will automatically fix itself very quickly
     and just means that how a merge conflict gets resolved
     is ambiguous. */
  next_available_time = (
    // the target logical time we want to use; if this works
    // we use it.
    time: number,
    // congruence class
    m: number = 0,
    // the modulus (e.g., number of distinct users)
    n: number = 1,
  ): number => {
    if (time <= this.maxTime) {
      // somebody stuck a time in the future (hence maxTime is large), so
      // we just switch to operating as a logical clock where now time
      // has nothing to do with the wall time.  That's fine -- we show
      // the user the actual walltime everywhere in the UI.
      // We also randomize things to reduce the change of a single user
      // conflicting with themselves in different branches.
      time = this.maxTime + Math.ceil(1000 * Math.random()) + 1;
    }
    // Ensure the congruence condition modulo n is satisfied.
    if (n <= 0) {
      n = 1;
    }
    // we add 50 to the modulus so that if a bunch of new users are joining at the exact same moment,
    // they don't have to be instantly aware of each other for this to keep working. Basically, we
    // give ourself a buffer of 10
    const modulus = n + 10;
    let a = m - (time % modulus);
    if (a < 0) {
      a += modulus;
    }
    time += a; // now time = m (mod n)
    // There is also no possibility of a conflict with a known time
    // since we made time bigger than this.maxTime.
    return time;
  };

  // Add patches to the patch list.  This *CAN* be already in the patch
  // list, can be replicated, and they will get put in the right place
  // with any new information they contain merged in.  Snapshot info
  // also is handled properly.
  add = (patches: Patch[]): void => {
    //    console.log("add", patches);
    //     for (let i = 0; i < patches.length; i++) {
    //       const patch = patches[i];
    //       if (patch.parents != null && patch.parents.length == 0 && patch.patch) {
    //         patches = patches.slice(0, i);
    //         break;
    //       }
    //     }
    //     (window as any).x = { patches };

    if (patches.length === 0) {
      // nothing to do
      return;
    }

    // This implementation is complicated because it can't make any assumptions
    // about uniqueness, etc., and also the snapshot info gets added later
    // long after the patch is initially made; it's done as a message later
    // in the stream.
    for (const originalPatch of patches) {
      // we make a shallow copy of the original patch, since this code
      // may shallow mutate it, e.g., filling in the snapshot info, and
      // we want to avoid any surprises/bugs (mainly with unit tests)
      const t: number = originalPatch.time;
      this.maxTime = Math.max(this.maxTime, t);
      if (
        !originalPatch.is_snapshot &&
        (this.staging[t] != null || this.live[t] != null)
      ) {
        // we have already added this patch
        continue;
      }
      const x = { ...originalPatch };
      if (x.is_snapshot) {
        // it's a snapshot
        if (this.live[t] != null) {
          // The corresponding patch was already loaded, so edit
          // the snapshot field of that patch.
          this.live[t].is_snapshot = true;
          this.live[t].snapshot = x.snapshot;
          this.live[t].seq_info = x.seq_info;
        } else if (this.staging[t] != null) {
          this.staging[t].is_snapshot = true;
          this.staging[t].snapshot = x.snapshot;
          this.staging[t].seq_info = x.seq_info;
        } else {
          // The corresponding patch was NOT yet loaded, so just
          // store this for later, in case it is loaded later.
          this.heldSnapshots[t] = x;
        }
        if (this.oldestSnapshot == null || this.oldestSnapshot.time > t) {
          this.oldestSnapshot = x;
        }
        // never include a snapshot message -- these just change patches,
        // and are not patches themselves.
        continue;
      } else {
        // not a snapshot, but maybe it's a patch for a snapshot that
        // was already loaded or just a new patch
        if (this.heldSnapshots[t] != null) {
          // It is for a snapshot, so merge in that snapshot info to x,
          // then handle x as normal below.
          x.is_snapshot = true;
          x.snapshot = this.heldSnapshots[t].snapshot;
          x.seq_info = this.heldSnapshots[t].seq_info;
          delete this.heldSnapshots[t];
        }
      }
      this.staging[t] = x;
    }

    while (true) {
      const v: { [time: number]: Patch } = {};
      const heads = getHeads(this.staging);
      if (heads.length == 0) {
        return;
      }
      const graph = { ...this.live, ...this.staging };
      for (const head of heads) {
        const times = getTimesWithHeads(graph, [head]);
        let isComplete = true;
        for (const t of times) {
          const patch = graph[t];
          if (isSnapshot(patch)) {
            continue;
          }
          for (const parent of patch.parents ?? []) {
            if (graph[parent] == null) {
              // non-snapshot with a missing parent!
              isComplete = false;
              break;
            }
          }
          if (!isComplete) {
            break;
          }
        }
        if (isComplete) {
          for (const t of times) {
            if (this.live[t] == null) {
              this.live[t] = this.staging[t];
              v[t] = this.live[t];
              delete this.staging[t];
            }
          }
        }
      }

      // This is O(n*log(n)) where n is the length of this.patches.
      const newPatches = Object.values(v);
      if (newPatches.length > 0) {
        delete this.versions_cache;
        this.patches = this.patches.concat(newPatches);
        this.patches.sort(patch_cmp);
        this.emit("change");
      } else {
        // nothing moved from staging to live, so **converged**.
        return;
      }
    }
  };

  /*
  value: Return the value of the document at the given (optional)
  point in time.  If the time is given, we include exactly the patches
  that were known at that point in time, applied in time order.
  If time is not given, we compute the current value of the document,
  which is the result of applying all *known* patches in time order.
  In particular, there are multiple heads, this is the result of
  merging them.

  If without_times is defined, it must be an array of Date objects; in that case
  the current value of the string is computed, but with all the patches
  at the given times in "without_times" ignored.  This is used elsewhere
  as a building block to implement undo.  We do not assume that
  without_times is sorted.

  CACHING: value({time}) does NOT depend in any way on patches that
  may be received in the future -- if even they are for past points in
  time (!) --, so we can safely cache it!  Patches for a past point in
  time received in the future would be part of a different branch (different
  component of the DAG), so we never have to consider them.
  If without_times is given, we restrict it to times <= time, and only if
  that is empty, then we can use cached values.
  */
  value = ({
    time,
    without_times,
    noCache,
    verbose,
  }: {
    time?: number;
    without_times?: number[];
    noCache?: boolean;
    verbose?: boolean;
  } = {}) => {
    if (time != null && this.live[time] == null) {
      throw Error(`unknown time: ${time}`);
    }
    const key = time;
    let without;
    if (without_times == null) {
      without = null;
    } else {
      let w = without_times;
      if (key != null) {
        w = w.filter((x) => x <= key);
      }
      without = new Set<number>(w);
    }
    if (!noCache && (without?.size ?? 0) > 0) {
      // do not use cache if without is relevant.
      noCache = true;
    }

    if (!noCache && key != null) {
      const v = this.getCache(key);
      if (v != null) {
        if (verbose) {
          console.log("value: done -- is in the cache");
        }
        return v;
      }
    }

    // get all times that were known at the given time
    let k: Set<number>;
    if (key != null) {
      k = this.knownTimes([key]);
    } else {
      // potentially a merge
      const heads = this.getHeads();
      if (heads.length == 0) {
        k = new Set<number>();
      } else {
        if (heads.length == 1 && !noCache) {
          const v = this.getCache(heads[0]);
          if (v != null) {
            return v;
          }
        }
        k = this.knownTimes(heads);
      }
    }

    // We remove file load patches that are identical and close in time,
    // since these may happen with multiple clients when the file changes
    // on disk, in the context of filesystem sync and compute servers.
    // It's a merge heuristic.
    const fileTimes = Array.from(k).filter((t) => this.live[t].file);
    if (fileTimes.length > 1) {
      fileTimes.sort();
      for (let i = 0; i < fileTimes.length - 1; i++) {
        if (fileTimes[i + 1] - fileTimes[i] <= this.fileTimeDedupTolerance) {
          if (
            isEqual(
              this.live[fileTimes[i + 1]].patch,
              this.live[fileTimes[i]].patch,
            )
          ) {
            k.delete(fileTimes[i]);
          }
        }
      }
    }

    if (verbose) {
      console.log("value: known times", k);
    }

    if (k.size == 0) {
      const value = this.from_str("");
      if (key != null) {
        this.setCache(key, value, 0);
      }
      return value;
    }

    // We are *not* using the cache to compute the value at the requested time.
    // The value is by definition the result of applying all patches in
    // the set k of times in sorted order.

    let v = Array.from(k).sort();
    let value: Document | null = null;
    if (!noCache) {
      // It may be possible to initialize using the cache, which would avoid a lot of work.
      for (let i = v.length - 1; i >= 0; i--) {
        const t = v[i];
        const x = this.getCache(t, i + 1);
        if (x != null) {
          v = v.slice(i + 1);
          value = x;
          if (verbose) {
            console.log("value: initialized using cached value", {
              value,
              time: t,
            });
          }
          break;
        }
      }
    }
    if (value == null) {
      const patch = this.live[v[0]];
      if (patch.snapshot != null) {
        value = this.from_str(patch.snapshot);
        v.shift();
      } else {
        value = this.from_str("");
      }
    }
    if (verbose) {
      console.log({ value: value.to_str() });
    }
    for (const t of v) {
      if (without != null && without.has(t)) {
        continue;
      }
      const { patch } = this.live[t];
      value = value.apply_patch(patch);
      if (verbose) {
        console.log("value", { patch, value: value.to_str() });
      }
    }
    if (key != null && (without == null || without.size == 0)) {
      this.setCache(key, value, k.size);
    }
    return value;
  };

  private setCache = (time: number, doc: Document, numTimes: number) => {
    this.cache.set(time, { doc, numTimes });
  };

  private getCache = (
    time: number,
    numTimes?: number,
  ): Document | undefined => {
    const v = this.cache.get(time);
    if (v == null) {
      return;
    }
    if (numTimes == null) {
      return v.doc;
    }
    if (v.numTimes == numTimes) {
      return v.doc;
    }
  };

  // For testing/debugging.  Go through the complete patch history and
  // verify that all snapshots are correct (or not -- in which case say so).
  validate_snapshots = (): void => {
    if (this.patches.length === 0) {
      return;
    }
    let value: Document;
    let i: number = 0;
    let x: Patch = this.patches[0];
    if (x.snapshot != null) {
      i += 1;
      value = this.from_str(x.snapshot);
    } else {
      value = this.from_str("");
    }

    for (x of this.patches.slice(i)) {
      value = value.apply_patch(x.patch);
      if (x.snapshot != null) {
        const snapshot_value = this.from_str(x.snapshot);
        if (!value.is_equal(snapshot_value)) {
          console.log(`FAIL (${x.time}): at ${i}`);
          console.log("diff(snapshot, correct)=");
          console.log(JSON.stringify(value.make_patch(snapshot_value)));
        } else {
          console.log(`GOOD (${x.time}): snapshot at ${i} by ${x.user_id}`);
        }
      }
      i += 1;
    }
  };

  // integer index of user who made the patch at given point in time.
  // Throws an exception if there is no patch at that point in time.
  user_id = (time): number => {
    const x = this.patch(time);
    if (x == null) {
      throw Error(`no patch at ${time}`);
    }
    return x.user_id;
  };

  // Patch at a given point in time.
  // Throws an exception if there is no patch at that point in time.
  // This doesn't includes patches in staging.
  patch = (time: number): Patch => {
    const p = this.live[time];
    if (p == null) {
      throw Error(`no patch at ${time}`);
    }
    return p;
  };

  versions = (): number[] => {
    // Compute and cache result, then return it; result gets cleared when new patches added.
    if (this.versions_cache == null) {
      this.versions_cache = this.patches.map((x) => x.time);
    }
    return this.versions_cache;
  };

  // Walltime of patch created at a given point in time.
  wallTime = (version: number): number | undefined => {
    const p = this.live[version];
    if (p != null) {
      return p.wall ?? p.time;
    }
    const s = this.staging[version];
    if (s != null) {
      return s.wall ?? s.time;
    }
  };

  hasVersion = (time: number): boolean => {
    return this.live[time] != null;
  };

  // Show the history of this document; used mainly for debugging purposes.
  show_history = ({
    milliseconds = true,
    trunc,
    log: log0,
    noCache,
  }: {
    milliseconds?: boolean;
    trunc?: number;
    log?: Function;
    noCache?: boolean;
  } = {}) => {
    if (milliseconds === undefined) {
      milliseconds = false;
    }
    if (trunc === undefined) {
      trunc = trunc ? trunc : 80;
    }
    if (log0 === undefined) {
      log0 = console.log;
    }
    let output = "\n";
    const log = (...args) => {
      output += args.join(" ") + "\n";
    };
    let i: number = 1;
    let x: Patch;
    for (x of this.patches) {
      const tm: Date = new Date(x.time);
      const tm_show: number | string = milliseconds
        ? tm.valueOf()
        : tm.toLocaleString();
      log(
        "-----------------------------------------------------\n",
        i,
        x.user_id,
        x.version,
        tm_show,
        JSON.stringify(x.parents),
        trunc_middle(JSON.stringify(x.patch), trunc),
      );
      const s = this.value({ time: x.time, noCache });
      log(
        x.snapshot
          ? "(SNAPSHOT) "
          : (x.parents?.length ?? 0) > 1
            ? "(MERGE)    "
            : "           ",
        JSON.stringify(trunc_middle(s.to_str(), trunc).trim()),
      );
      i += 1;
    }
    output +=
      "\n\nCurrent: " +
      JSON.stringify(
        trunc_middle(this.value({ noCache }).to_str(), trunc).trim(),
      );
    log0(output);
  };

  /* This function does not MAKE a snapshot; it just
     returns the time at which we must plan to make a snapshot.
     Returns undefined if do NOT need to make a snapshot soon.
     NOTE: we want to make snapshots as far in the past from
     right now as possible, since users can't insert new offline
     patches *before* the most recent snapshot (in that situation
     all offline work has to get rebased before being inserted
     in history).

     RULE 1: If the number of patches since the most recent snapshot
     (or the start of time) is >= 2*interval, we would make a snapshot
     at the patch that is interval steps forward from most recent
     or start of time.

     RULE 2: If the sum of the patch sizes since the last
     snapshot (or start of time) exceeds max_size, we make a
     new snapshot at that point in time (starting from the last snapshot)
     when the sum of the patch sizes exceeds max_size.  We do this
     since this is the most canonical choice, in that many distinct
     participants would be mostly likely to make the same choice, which
     increases the chances of avoiding conflicts.  Also, if there are
     tons of big patches, each time there is a new patch that
     gets committed, a new snapshot would get made until no
     more need to be made.  This isn't maximally efficient, in that
     several extra snapshots might get made, but maybe that is OK.

     RULE 3: The collection of all known patches >= snapshot time
     should have exactly one tail, which is the snapshot time.
     In particular, this sort of situation is not allowed:
        time=10: snapshot
        time=11: parents=[10]
        time=12: parents=[11,9]  <--- very bad
     The above would be bad, because the tails are 10 *and* 9.
     The easiest way to think about this is that if you take the subgraph
     of all patches >= snapshot_time, then the node at snapshot_time
     is the ONLY one that is allowed to point to nodes <= snapshot_time.
     */
  private neverSnapshotTimes = new Set<number>();
  time_of_unmade_periodic_snapshot = (
    interval: number,
    max_size: number,
  ): number | undefined => {
    // This satisfies rules 1 and 2.
    let i = this.canidateSnapshotIndex({ interval, max_size });
    if (i == null) {
      return;
    }
    return this.nextValidSnapshotTime({ interval, i });
  };

  // this implements rule 3 above, namely checking that the data starting
  // with the given snapshot is valid graph.
  private nextValidSnapshotTime = ({
    // length of interval that we target for making snapshot
    interval,
    // index into patch list
    i,
  }: {
    interval: number;
    i: number;
  }) => {
    const minAge = Math.min(interval, 5);
    while (
      i < this.patches.length - minAge &&
      this.neverSnapshotTimes.has(this.patches[i].time)
    ) {
      i += 1;
    }
    if (i >= this.patches.length - minAge) {
      return;
    }
    // try successive patches up to MAX_ATTEMPTS for one that can be snapshotted.
    const MAX_ATTEMPTS = 10;
    const graph: { [time: number]: Patch } = {};
    for (const patch of this.patches.slice(i)) {
      graph[patch.time] = patch;
    }
    for (
      let attempts = 0;
      attempts < MAX_ATTEMPTS && i < this.patches.length - minAge;
      attempts++
    ) {
      let time = this.patches[i].time;
      // Does time also satisfy rule 3?  If so, we use it. If not, we
      // wait until a new option comes along.
      const missing = getMissingNodes(graph);
      if (missing.length != 1) {
        this.neverSnapshotTimes.add(time);
        delete graph[time];
        i += 1;
      } else {
        // it satisfies rule 3 as well!
        return time;
      }
    }
  };

  private canidateSnapshotIndex = ({
    interval,
    max_size,
  }): number | undefined => {
    const n = this.patches.length - 1;
    let cur_size: number = 0;
    for (let i = n; i >= 0; i--) {
      const is_snapshot = isSnapshot(this.patches[i]);
      if (!is_snapshot) {
        // add this patch to our size count.  NOTE -- we do not
        // include the snapshot in the size count, since the
        // snapshot already incorporates the patch itself.
        cur_size += this.patches[i].size;
      }
      if (is_snapshot || i == 0) {
        // This is the most recent snapshot or the beginning of time.
        if (i + 2 * interval <= n) {
          // Time to make a snapshot, based purely on the number
          // of patches made since the last snapshot (or beginning of time).
          return i + interval;
        }
        // No reason to make snapshot based on number of patches.  What about size?
        if (cur_size > max_size) {
          // Time to make a snapshot, based on the total size since the last
          // snapshot (or beginning of time).
          // Make snapshot at first time where max_size exceeded.
          // We start at i+1 when snapshot below, since the snapshot position
          // itself includes the patch.
          let cnt_size = 0;
          for (let j = is_snapshot ? i + 1 : i; j <= n; j++) {
            cnt_size += this.patches[j].size;
            if (cnt_size > max_size) {
              return j;
            }
          }
          return; // this should be unreachable
        } else {
          // We found a relatively recent snapshot before max_size exceeded,
          // so we don't need to make a snapshot.
          return;
        }
      }
    }
  };

  /* Return the most recent time of a patch, or undefined if
     there are no patches. */
  newest_patch_time = (): number | undefined => {
    if (this.patches.length === 0) {
      return;
    }
    return this.patches[this.patches.length - 1].time;
  };

  count = (): number => {
    return this.patches.length;
  };

  export = (): Patch[] => {
    return deep_copy(this.patches);
  };

  // get oldest snapshot, or undefined if the oldest "snapshot"
  // is "beginning of time" and we have it.
  // This is ONLY used for loading more patches by using the
  // sequence number data recorded in the snapshot.
  getOldestSnapshot = (): Patch | undefined => {
    if (this.hasFullHistory()) {
      return undefined;
    }
    return this.oldestSnapshot;
  };

  getHeads = (): number[] => {
    return getHeads(this.live);
  };

  private getTails = (): number[] => {
    return getTails(this.live);
  };

  // if true, then it is necessary to load more history before computing
  // all values.  For some value computations, an error would be raised
  // due to missing history.
  nonSnapshotTails = () => {
    const tails = this.getTails();
    const nonSnapshotTails: number[] = [];
    for (const t of tails) {
      const patch = this.live[t];
      if (patch.parents == null || patch.parents.length == 0) {
        // start of editing, so is a snapshot
      } else if (patch.snapshot != null) {
        // is a snapshot
      } else {
        // not a snapshot
        nonSnapshotTails.push(t);
      }
    }
    return nonSnapshotTails;
  };

  private knownTimes = (heads: number[]): Set<number> => {
    return getTimesWithHeads(this.live, heads, true);
  };
}

// a patch is a snapshot if it is an actual patch (not
// just a message adding snapshot info) and it is either
// an actual snapshot or a patch with no parents, i.e.,
// which should only be the first ever patch when the
// document was initialized by a file on disk.
function isSnapshot(patch: Patch): boolean {
  return (
    patch.patch != null &&
    (patch.is_snapshot || (patch.parents ?? []).length == 0)
  );
}

function getHeads(graph: { [time: number]: Patch }): number[] {
  const X = new Set<number>(Object.keys(graph).map((x) => parseInt(x)));
  if (X.size == 0) {
    return [];
  }
  for (const patch of Object.values(graph)) {
    if (patch.parents != null) {
      for (const s of patch.parents) {
        X.delete(s);
        if (X.size <= 1) {
          // since this is a DAG, there has to be *at least* one
          // head so we can shortcut out at this point, rather
          // than spend  alot of time deleting things that are
          // already removed.
          return Array.from(X).sort();
        }
      }
    }
  }
  return Array.from(X).sort();
}

function getTails(graph: { [time: number]: Patch }): number[] {
  // the tails are the nodes with no parents in the DAG.
  const tails: number[] = [];
  for (const patch of Object.values(graph)) {
    if (patch.parents == null || patch.parents.length == 0) {
      tails.push(patch.time);
    } else {
      let isTail = true;
      for (const t of patch.parents) {
        if (graph[t] != null) {
          isTail = false;
          break;
        }
      }
      if (isTail) {
        tails.push(patch.time);
      }
    }
  }
  return tails;
}

// Iterative version using a stack to find the components of a node
// This is fast enough, e.g. 100K nodes in 50ms and scales linearly.
// ** This stops at snapshots, i.e., it's the component containing the
// node with given time, but when we hit any snasphot not we stop
// going further.**
function getTimesWithHeads(
  graph: { [time: number]: Patch },
  heads: number[],
  verify = false,
): Set<number> {
  const visited = new Set<number>([]);
  const stack: number[] = [...heads];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null || visited.has(current)) {
      continue;
    }
    const patch = graph[current];
    if (patch == null) {
      if (visited.size == 0) {
        if (verify) {
          throw Error(`there is no patch at time ${current}`);
        }
      }
      if (verify) {
        // If this happens, it means that there is a tail in the DAG
        // that is NOT a snapshot, which means it is impossible to
        // properly compute all known times or the value of the document
        // with the given heads without loading more history.
        throw Error(
          `incomplete patch data at time ${current}: load more history`,
        );
      }
    }
    // patch is loaded so add it to our list
    visited.add(current);
    if (patch?.parents != null && !patch.is_snapshot) {
      for (const s of patch.parents) {
        if (!visited.has(s)) {
          stack.push(s);
        }
      }
    }
  }

  return visited;
}

function getMissingNodes(graph: { [time: number]: Patch }): number[] {
  // missing are the nodes that are pointed out by nodes of the graph,
  // but aren't in our graph.
  const missing = new Set<number>();
  for (const patch of Object.values(graph)) {
    for (const t of patch.parents ?? []) {
      if (graph[t] == null) {
        // ut oh.
        missing.add(t);
      }
    }
  }
  return Array.from(missing);
}

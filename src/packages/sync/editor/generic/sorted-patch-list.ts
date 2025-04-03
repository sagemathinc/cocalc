/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Sorted list of patches applied to a starting string/object.
*/

import { EventEmitter } from "events";
import { isEqual } from "lodash";
import { Document, Patch } from "./types";
import { patch_cmp } from "./util";
import { close, cmp_Date, deep_copy, trunc_middle } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import LRU from "lru-cache";

const MAX_PATCHLIST_CACHE_SIZE = 40;

export class SortedPatchList extends EventEmitter {
  private from_str: (s: string) => Document;
  private firstSnapshot?: Date;
  private loadMoreHistory?: () => Promise<boolean>;

  private patches: Patch[] = [];
  private heldSnapshots: { [time: number]: Patch } = {};
  private heldPatches: { [time: number]: Patch } = {};

  // the patches indexed by time
  private times: { [time: number]: Patch } = {};

  private versions_cache: Date[] | undefined;

  // todo -- size?
  private cache: LRU<number, Document> = new LRU({
    max: MAX_PATCHLIST_CACHE_SIZE,
  });

  // all the times when there are snapshots.
  private all_snapshot_times: { [time: string]: boolean } = {};

  constructor(
    from_str,
    firstSnapshot?: Date,
    loadMoreHistory?: () => Promise<boolean>,
  ) {
    super();
    this.from_str = from_str;
    this.firstSnapshot = firstSnapshot;
    this.loadMoreHistory = loadMoreHistory;
  }

  setFirstSnapshot = (firstSnapshot?: Date) => {
    const prev = this.firstSnapshot;
    this.firstSnapshot = firstSnapshot;
    if (prev != null && (firstSnapshot ?? new Date(0)) < prev) {
      // moving the firstSnapshot time back in time, e.g., due to loading more history.
      // In this case we should check if any of the held patches are within the new window.
      const cutoff = (firstSnapshot ?? new Date(0)).valueOf();
      const patches: Patch[] = [];
      for (const t in this.heldPatches) {
        if (parseInt(t) >= cutoff) {
          patches.push(this.heldPatches[t]);
          delete this.heldPatches[t];
        }
      }
      if (patches.length > 0) {
        this.add(patches);
      }
    }
  };

  close = (): void => {
    this.removeAllListeners();
    this.cache.clear();
    close(this);
  };

  /* Choose the next available time in ms that is congruent to
     m modulo n.  The congruence condition is so that any time
     collision will have to be with a single person editing a
     document with themselves -- two different users are
     guaranteed to not collide.  Note: even if there is a
     collision, it will automatically fix itself very quickly. */
  next_available_time = (
    time: Date | number,
    m: number = 0,
    n: number = 1,
  ): Date => {
    let t: number;
    if (typeof time === "number") {
      t = time;
    } else {
      t = time.valueOf();
    }

    if (n <= 0) {
      n = 1;
    }
    let a = m - (t % n);
    if (a < 0) {
      a += n;
    }
    t += a; // now t = m (mod n)
    while (this.times[t] != null) {
      t += n;
    }
    return new Date(t);
  };

  // Add patches to the patch list.  This *CAN* be already in the patch
  // list, can be replicated, and they will get put in the right place
  // with any new information they contain merged in.  Snapshot info
  // also is handled properly.
  add = (patches: Patch[]): void => {
    if (patches.length === 0) {
      // nothing to do
      return;
    }
    // This implementation is complicated because it can't make any assumptions
    // about uniqueness, etc., and also the snapshot info gets added later
    // long after the patch is initially made; it's done as a message later
    // in the stream.
    const v: { [time: number]: Patch } = {};
    let oldest: Date | undefined = undefined;
    for (const originalPatch of patches) {
      // we make a shallow copy of the original patch, since this code
      // may shallow mutate it, e.g., filling in the snapshot info, and
      // we want to avoid any surprises/bugs (mainly with unit tests)
      const x = { ...originalPatch };
      const t: number = x.time.valueOf();

      if (this.firstSnapshot != null && x.time < this.firstSnapshot) {
        // this is a patch that was added late (e.g., due to a user being
        // offline), so it's time is before we are even interested, but its
        // sequence numbrer is large.  We will only look at it if the
        // user decides to load more history, which updates firstSnapshot.
        if (x.is_snapshot) {
          this.heldSnapshots[t] = x;
        } else {
          this.heldPatches[t] = x;
        }
        continue;
      }
      const cur = this.times[t] ?? v[t];
      if (x.is_snapshot) {
        // it's a snapshot
        if (this.times[t] != null) {
          // The corresponding patch was already loaded, so edit
          // the snapshot field of that patch.
          this.all_snapshot_times[t] = true;
          this.times[t].is_snapshot = true;
          this.times[t].snapshot = x.snapshot;
          this.times[t].seq_info = x.seq_info;
        } else {
          // The corresponding patch was NOT yet loaded, so just
          // store this for later, in case it is loaded later.
          this.heldSnapshots[t] = x;
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
        if (cur != null) {
          // We already have a patch with this time.  Update it, if necessary?
          if (
            isEqual(cur.patch, x.patch) &&
            cur.user_id === x.user_id &&
            cur.snapshot === x.snapshot
          ) {
            // re-inserting a known patch; nothing at all to do
          } else {
            // I think this should never happen anymore. (?)
            // (1) adding a snapshot or (2) a timestamp collision -- remove duplicate
            // remove patch with same timestamp from the sorted list of patches
            this.patches = this.patches.filter((y) => y.time.valueOf() !== t);
            this.emit("overwrite", t);
          }
          continue;
        }
      }
      v[t] = x;
      this.times[t] = x;
      if (oldest == null || oldest > x.time) {
        oldest = x.time;
      }
    }

    // This is O(n*log(n)) where n is the length of this.patches.
    // TODO: Better would probably be an insertion sort, which
    // would be O(m*log(n)) where m=patches.length...
    const newPatches = Object.values(v);
    if (newPatches.length > 0) {
      delete this.versions_cache;
      this.patches = this.patches.concat(newPatches);
      this.patches.sort(patch_cmp);
    }
    this.updateIndexes();
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

  // **TODO** this gives the wrong answer for old things since we may
  // have to load more!!!  E.g., if a patch points to something that isn't
  // loaded yet, then needs to throw an error.
  value = ({
    time,
    without_times,
    noCache,
    verbose,
  }: {
    time?: Date;
    without_times?: Date[];
    noCache?: boolean;
    verbose?: boolean;
  } = {}) => {
    if (time != null && this.times[time.valueOf()] == null) {
      throw Error(`unknown time: ${time}`);
    }
    const key = time?.valueOf();
    let without;
    if (without_times == null) {
      without = null;
    } else {
      let w = without_times.map((x) => x.valueOf());
      if (key != null) {
        w = w.filter((x) => x <= key!);
      }
      without = new Set<number>(w);
    }
    if (!noCache && (without?.size ?? 0) > 0) {
      // do not use cache if without is relevant.
      noCache = true;
    }

    if (!noCache && key != null) {
      const v = this.cache.get(key);
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
      const heads = this.getHeads();
      if (heads.length == 0) {
        k = new Set<number>();
      } else {
        if (heads.length == 1 && !noCache) {
          const v = this.cache.get(heads[0]);
          if (v != null) {
            return v;
          }
        }
        k = this.knownTimes(heads);
      }
    }

    if (verbose) {
      console.log("value: known times", k);
    }

    if (k.size == 0) {
      const value = this.from_str("");
      if (key != null) {
        this.cache.set(key, value);
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
        if (this.cache.has(t)) {
          value = this.cache.get(t)!;
          v = v.slice(i + 1);
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
      const patch = this.times[v[0]];
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
      const { patch } = this.times[t];
      value = value.apply_patch(patch);
      if (verbose) {
        console.log("value", { patch, value: value.to_str() });
      }
    }
    if (key != null && (without == null || without.size == 0)) {
      console.log("saving to cache", { key, value: value.to_str() });
      this.cache.set(key, value);
    }
    return value;
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
  patch = (time): Patch => {
    const p = this.times[time.valueOf()];
    if (p == null) {
      throw Error(`no patch at ${time}`);
    }
    return p;
  };

  versions = (): Date[] => {
    // Compute and cache result,then return it; result gets cleared when new patches added.
    if (this.versions_cache == null) {
      this.versions_cache = this.patches.map((x) => x.time);
    }
    return this.versions_cache;
  };

  // Show the history of this document; used mainly for debugging purposes.
  show_history = ({
    milliseconds,
    trunc,
    log: log0,
  }: {
    milliseconds?: boolean;
    trunc?: number;
    log?: Function;
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
      const tm: Date = x.time;
      const tm_show: number | string = milliseconds
        ? tm.valueOf()
        : tm.toLocaleString();
      log(
        "-----------------------------------------------------\n",
        i,
        x.user_id,
        tm_show,
        JSON.stringify(x.parents),
        trunc_middle(JSON.stringify(x.patch), trunc),
      );
      const s = this.value({ time: tm });
      log(
        x.snapshot ? "(SNAPSHOT) " : "           ",
        JSON.stringify(trunc_middle(s.to_str(), trunc).trim()),
      );
      i += 1;
    }
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
     */
  time_of_unmade_periodic_snapshot = (
    interval: number,
    max_size: number,
  ): Date | undefined => {
    const n = this.patches.length - 1;
    let cur_size: number = 0;
    for (let i = n; i >= 0; i--) {
      const is_snapshot: boolean = !!this.patches[i].is_snapshot;
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
          return this.patches[i + interval].time;
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
              return this.patches[j].time;
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

  // Times of all snapshots in memory on this client; these are
  // the only ones we need to worry about for offline patches.
  snapshot_times = (): Date[] => {
    const v: Date[] = [];
    let t: string;
    for (t in this.all_snapshot_times) {
      v.push(new Date(parseInt(t)));
    }
    v.sort(cmp_Date);
    return v;
  };

  /* Return the most recent time of a patch, or undefined if
     there are no patches. */
  newest_patch_time = (): Date | undefined => {
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

  // undefined means the oldest snapshot is "beginning of time"
  getOldestSnapshot = (): Patch | undefined => {
    if (this.patches[0]?.is_snapshot) {
      return this.patches[0];
    }
  };

  updateIndexes = reuseInFlight(async () => {
    await this.ensureTailsAreSnapshots();
    let index = this.patches[0]?.seq_info?.index ?? 0;
    for (const patch of this.patches) {
      patch.index = index;
      index += 1;
    }
  });

  getIndex = (time: Date): number | undefined => {
    return this.times[time.valueOf()]?.index;
  };

  startIndex = (): number | undefined => {
    return this.patches[0]?.index;
  };

  getHeads = (): number[] => {
    const X = new Set<number>(Object.keys(this.times).map((x) => parseInt(x)));
    if (X.size == 0) {
      return [];
    }
    for (const patch of Object.values(this.times)) {
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
  };

  private getTails = (): number[] => {
    // the tails are the nodes with no parents in the DAG.
    const tails: number[] = [];
    for (const patch of Object.values(this.times)) {
      if (patch.parents == null || patch.parents.length == 0) {
        tails.push(patch.time.valueOf());
      } else {
        let isTail = true;
        for (const t of patch.parents) {
          if (this.times[t] != null) {
            isTail = false;
            break;
          }
        }
        if (isTail) {
          tails.push(patch.time.valueOf());
        }
      }
    }
    return tails;
  };

  // if true, then it is necessary to load more history before computing
  // all values.  For some value computations, an error would be raised
  // due to missing history.
  nonSnapshotTails = () => {
    const tails = this.getTails();
    const nonSnapshotTails: number[] = [];
    for (const t of tails) {
      const patch = this.times[t];
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

  private ensureTailsAreSnapshots = async () => {
    if (this.loadMoreHistory == null) {
      // functionality is not available (e.g., when unit testing we might not enable this)
      return;
    }
    while (true) {
      const nsTails = this.nonSnapshotTails();
      if (nsTails.length == 0) {
        return;
      }
      const hasMore = await this.loadMoreHistory();
      if (!hasMore) {
        return;
      }
    }
  };

  // Iterative version using a stack to find the components of a node
  // This is fast enough, e.g. 100K nodes in 50ms and scales linearly.
  // ** This stops at snapshots, i.e., it's the component containing the
  // node with given time, but when we hit any snasphot not we stop
  // going further.**
  private knownTimes = (heads: number[]): Set<number> => {
    const visited = new Set<number>([]);
    const stack: number[] = [...heads];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null || visited.has(current)) {
        continue;
      }
      const patch = this.times[current];
      if (patch == null) {
        if (visited.size == 0) {
          throw Error(`there is no patch at time ${current}`);
        }
        // If this happens, it means that there is a tail in the DAG
        // that is NOT a snapshot, which means it is impossible to
        // properly compute all known times or the value of the document
        // with the given heads without loading more history.
        throw Error(
          `incomplete patch data at time ${current}: load more history`,
        );
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
  };
}

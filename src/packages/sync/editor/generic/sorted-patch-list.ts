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
import { Entry, PatchValueCache } from "./patch-value-cache";

// Make this bigger to make things faster... at the
// cost of using more memory.  TODO: a global LRU cache
// accounting for size might make more sense (?).
const MAX_PATCHLIST_CACHE_SIZE = 20;

export class SortedPatchList extends EventEmitter {
  private from_str: (s: string) => Document;
  private firstSnapshot?: Date;
  private patches: Patch[] = [];
  private heldSnapshots: { [time: number]: Patch } = {};
  private heldPatches: { [time: number]: Patch } = {};

  // the patches indexed by time
  private times: { [time: number]: Patch } = {};

  private versions_cache: Date[] | undefined;

  private cache: PatchValueCache = new PatchValueCache();

  // all the times when there are snapshots.
  private all_snapshot_times: { [time: string]: boolean } = {};

  constructor(from_str, firstSnapshot?: Date) {
    super();
    this.from_str = from_str;
    this.firstSnapshot = firstSnapshot;
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
            cur.snapshot === x.snapshot &&
            cmp_Date(cur.prev, x.prev) === 0
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

    if (oldest != null) {
      // invalidate anything cached back to oldest.
      this.cache.invalidate(oldest);
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

  private newest_snapshot_time = (): Date => {
    let t0 = 0;
    let t: string;
    for (t in this.all_snapshot_times) {
      const d: number = parseInt(t);
      if (d > t0) {
        t0 = d;
      }
    }
    return new Date(t0);
  };

  /*
    value: Return the value of the document at the given (optional)
    point in time.  If the time is given, only include patches up
    to (and including) the given time; otherwise, return the current
    (newest) value.

    If force is true, doesn't use snapshot at given input time, even if
    there is one; this is used to update snapshots in case of offline changes
    getting inserted into the changelog.

    If without_times is defined, it must be an array of Date objects; in that case
    the current value of the string is computed, but with all the patches
    at the given times in "without_times" ignored.  This is used elsewhere
    as a building block to implement undo.  We do not assume that
    without_times is sorted.
  */
  value = ({
    time,
    without_times,
  }: {
    time?: Date;
    without_times?: Date[];
  } = {}): Document => {
    // oldest time that is skipped:
    let oldest_without_time: Date | undefined = undefined;
    // all skipped times.
    let without_times_set: { [time_since_epoch: number]: true } = {};

    if (without_times != null) {
      // Process without_times to get a map from time numbers to true.
      if (without_times.length > 0) {
        for (const x of without_times) {
          // convert x to number (then string as key)
          without_times_set[x.valueOf()] = true;
          if (oldest_without_time == null || x < oldest_without_time) {
            oldest_without_time = x;
          }
        }
        if (
          time != null &&
          oldest_without_time != null &&
          time < oldest_without_time
        ) {
          // requesting value at time before any oldest_without_time, so
          // is not relevant, so ignore.
          oldest_without_time = undefined;
          without_times = undefined;
          without_times_set = {};
        }
      }
    }

    // we do not discard patch due to prev if prev is before this.
    const prev_cutoff: Date = this.newest_snapshot_time();

    // Determine oldest cached value (undefined if nothing cached)
    const oldest_cached_time: Date | undefined = this.cache.oldest_time();

    let value: Document;
    // If the oldest cached value exists and is at least as old as
    // the requested point in time, use it as a base.
    if (
      oldest_cached_time != null &&
      (time == null || time >= oldest_cached_time) &&
      (oldest_without_time == null || oldest_without_time > oldest_cached_time)
    ) {
      // There is something in the cache, and it is at least as
      // far back in time as the value we want to compute now or
      // any without skips.
      let entry: Entry | undefined;
      if (oldest_without_time != null) {
        // true makes "at most" strict, so <.
        entry = this.cache.newest_value_at_most(oldest_without_time, true);
      } else {
        entry = this.cache.newest_value_at_most(time);
      }
      if (entry === undefined) {
        throw Error("BUG -- cache should contain a value, but doesn't");
      }
      let { start, time: cache_time } = entry;
      value = entry.value;
      let x: Patch;
      for (x of this.patches.slice(start, this.patches.length)) {
        // all patches starting with the cached one
        if (time != null && x.time > time) {
          // We are done -- no more patches need to be applied
          break;
        }
        if (
          x.prev == null ||
          this.times[x.prev.valueOf()] ||
          x.prev <= prev_cutoff
        ) {
          if (
            oldest_without_time == null ||
            (oldest_without_time != null &&
              !without_times_set[x.time.valueOf()])
          ) {
            // apply patch x to update value to be closer to what we want
            value = value.apply_patch(x.patch);
          }
        }
        // also record the time of the last patch we applied:
        cache_time = x.time;
        start += 1;
      }
      if (
        oldest_without_time == null &&
        (time == null || start - entry.start >= 10)
      ) {
        // Newest -- or at least 10 patches needed to be applied -- so cache result
        this.cache.include(cache_time, value, start);
        this.cache.prune(MAX_PATCHLIST_CACHE_SIZE); // TODO: include info about size of docs?
      }
    } else {
      // Cache is empty or doesn't have anything sufficiently old to be useful.
      // Find the newest snapshot at a time that is <= time.
      value = this.from_str(""); // default in case no snapshots
      let start: number = 0;
      for (let i = this.patches.length - 1; i >= 0; i--) {
        if (
          (time == null || this.patches[i].time <= time) &&
          this.patches[i].snapshot != null
        ) {
          const x = this.patches[i];
          if (x.snapshot == null) {
            throw Error("to satisfy typescript");
          }
          // Found a patch with known snapshot that is as old as the time.
          // This is the base on which we will apply other patches to move forward
          // to the requested time.
          value = this.from_str(x.snapshot);
          start = i + 1;
          break;
        }
      }

      // Apply each of the patches we need to get from
      // value (the last snapshot) to time.
      let cache_time: Date | undefined = undefined;
      let cache_start: number = start;
      let x: Patch;
      for (x of this.patches.slice(start, this.patches.length)) {
        if (time != null && x.time > time) {
          // Done -- no more patches need to be applied
          break;
        }
        // Apply a patch to move us forward.
        //console.log("applying patch #{i}")
        if (
          x.prev == null ||
          this.times[x.prev.valueOf()] ||
          x.prev <= prev_cutoff
        ) {
          if (
            oldest_without_time == null ||
            (oldest_without_time != null &&
              !without_times_set[x.time.valueOf()])
          ) {
            try {
              value = value.apply_patch(x.patch);
            } catch (err) {
              // See https://github.com/sagemathinc/cocalc/issues/3191
              // This apply_patch *can* fail in practice due to
              // a horrible massively nested data structure that appears
              // due to a bug.  This happened with #3191.  It's better
              // just skip the patch than to make the project and all
              // files basically be massively broken!
              console.warn(
                "WARNING: unable to apply a patch -- skipping it",
                err,
              );
            }
          }
        }
        cache_time = x.time;
        cache_start += 1;
      }
      if (
        cache_time != null &&
        oldest_without_time == null &&
        (time == null || cache_start - start >= 10)
      ) {
        // Newest -- or at least 10 patches needed to be applied -- so
        // update the cache with our new known value
        this.cache.include(cache_time, value, cache_start);
        this.cache.prune(MAX_PATCHLIST_CACHE_SIZE); // TODO: use info about size of docs?
      }
    }

    // Use the following only for testing/debugging,
    // since it will make everything VERY slow.
    /*
    if (value != null && !value.is_equal(this.value_no_cache(time))) {
        console.warn(`value for time ${time} is wrong!`)
    }
    */

    return value;
  };

  // VERY Slow -- only for consistency checking purposes and debugging.
  // If snapshots=false, don't use snapshots.
  value_no_cache = (time?: Date, snapshots: boolean = true): Document => {
    let value: Document = this.from_str(""); // default in case no snapshots
    let start: number = 0;
    const prev_cutoff: Date = this.newest_snapshot_time();
    if (snapshots && this.patches.length > 0) {
      for (let i = this.patches.length - 1; i >= 0; i--) {
        const x: Patch = this.patches[i];
        if ((time == null || x.time <= time) && x.snapshot != null) {
          // Found a patch with known snapshot that is as old as the time.
          // This is the base on which we will apply other patches to move
          // forward to the requested time.
          value = this.from_str(x.snapshot);
          start = i + 1;
          break;
        }
      }
    }
    // Apply each of the patches we need to get from
    // value (the last snapshot) to time.
    let x: Patch;
    for (x of this.patches.slice(start, this.patches.length)) {
      if (time != null && x.time > time) {
        // Done -- no more patches need to be applied
        break;
      }
      if (
        x.prev == null ||
        this.times[x.prev.valueOf()] ||
        x.prev <= prev_cutoff
      ) {
        value = value.apply_patch(x.patch);
      } else {
        console.log("skipping patch due to prev", x);
      }
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

  // Returns time when patch was sent out, or undefined.  This is
  // ONLY set if the patch was sent at a significantly different
  // time than when it was created, e.g., due to it being offline.
  // Throws an exception if there is no patch at that point in time.
  time_sent = (time): Date | undefined => {
    return this.patch(time).sent;
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
    let i: number = 0;
    let s: Document | undefined;
    const prev_cutoff: Date = this.newest_snapshot_time();
    let x: Patch;
    let first_time: boolean = true;
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
        trunc_middle(JSON.stringify(x.patch), trunc),
      );
      if (s === undefined) {
        s = this.from_str(x.snapshot != null ? x.snapshot : "");
      }
      if (first_time && x.snapshot != null) {
        // do not apply patch no matter what.
      } else {
        if (
          x.prev == null ||
          this.times[x.prev.valueOf()] ||
          x.prev <= prev_cutoff
        ) {
          s = s.apply_patch(x.patch);
        } else {
          log(
            `prev=${x.prev.valueOf()} is missing, so not applying this patch`,
          );
        }
      }
      first_time = false;
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

  updateIndexes = () => {
    let index = this.patches[0]?.seq_info?.index ?? 0;
    for (const patch of this.patches) {
      patch.index = index;
      index += 1;
    }
  };

  getIndex = (time: Date): number | undefined => {
    return this.times[time.valueOf()]?.index;
  };

  startIndex = (): number | undefined => {
    return this.patches[0]?.index;
  };
}

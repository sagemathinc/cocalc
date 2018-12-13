/*
Sorted list of patches applied to a starting string/object.
*/

import { EventEmitter } from "events";

import { isEqual } from "underscore";

import { Document, Patch } from "./types";

import { patch_cmp } from "./util";

import { cmp_Date, trunc_middle } from "../../../misc2";

import { Entry, PatchValueCache } from "./patch-value-cache";

// Make this bigger to make things faster... at the
// cost of using more memory.
const MAX_PATCHLIST_CACHE_SIZE = 20;

export class SortedPatchList extends EventEmitter {
  private from_str: (s: string) => Document;
  private patches: Patch[] = [];

  // the patches indexed by time
  private times: { [time: string]: Patch } = {};

  private versions_cache: Date[] | undefined;

  private cache: PatchValueCache = new PatchValueCache();

  // all the times when there are snapshots.
  private all_snapshot_times: { [time: string]: boolean } = {};

  constructor(from_str) {
    super();
    this.from_str = from_str;
  }

  public close(): void {
    this.removeAllListeners();
    delete this.patches;
    delete this.times;
    delete this.cache;
    delete this.versions_cache;
    delete this.all_snapshot_times;
  }

  /* Choose the next available time in ms that is congruent to
     m modulo n.  The congruence condition is so that any time
     collision will have to be with a single person editing a
     document with themselves -- two different users are
     guaranteed to not collide.  Note: even if there is a
     collision, it will automatically fix itself very quickly. */
  public next_available_time(
    time: Date | number,
    m: number = 0,
    n: number = 1
  ): Date {
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
  }

  public add(patches: Patch[]): void {
    if (patches.length === 0) {
      // nothing to do
      return;
    }
    const v: Patch[] = [];
    let oldest: Date | undefined = undefined;
    let x: Patch;
    for (x of patches) {
      let t: number = x.time.valueOf();
      const cur = this.times[t];
      if (cur != null) {
        // Hmm -- We already have a patch with this time.
        if (
          isEqual(cur.patch, x.patch) &&
          cur.user_id === x.user_id &&
          cur.snapshot === x.snapshot &&
          cmp_Date(cur.prev, x.prev) === 0
        ) {
          // re-inserting a known patch; nothing at all to do
          continue;
        } else {
          // (1) adding a snapshot or (2) a timestamp collision -- remove duplicate
          // remove patch with same timestamp from the sorted list of patches
          this.patches = this.patches.filter(y => y.time.valueOf() !== t);
          this.emit("overwrite", t);
        }
      }
      v.push(x);
      this.times[t] = x;
      if (oldest == null || oldest > x.time) {
        oldest = x.time;
      }
      if (x.snapshot != null) {
        this.all_snapshot_times[t] = true;
      }
    }

    if (oldest !== undefined) {
      // invalidate anything cached back to oldest.
      this.cache.invalidate(oldest);
    }

    // This is O(n*log(n)) where n is the length of this.patches.
    // TODO: Better would probably be an insertion sort, which
    // would be O(m*log(n)) where m=patches.length...
    if (v.length > 0) {
      delete this.versions_cache;
      this.patches = this.patches.concat(v);
      this.patches.sort(patch_cmp);
    }
  }

  private newest_snapshot_time(): Date {
    let t0 = 0;
    let t: string;
    for (t in this.all_snapshot_times) {
      let d: number = parseInt(t);
      if (d > t0) {
        t0 = d;
      }
    }
    return new Date(t0);
  }

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
  public value(time?: Date, force?: boolean, without_times?: Date[]): Document {
    // oldest time that is skipped:
    let oldest_without_time: Date | undefined = undefined;
    // all skipped times.
    let without_times_set: { [time_since_epoch: number]: true } = {};

    if (without_times != null) {
      // Process without_times to get a map from time numbers to true.
      if (without_times.length > 0) {
        for (let x of without_times) {
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
          if (force && cmp_Date(x.time, time) === 0) {
            // If force is true we do NOT want to use the existing snapshot, since
            // the whole point is to force recomputation of it, as it is wrong.
            // Instead, we'll use the previous snapshot.
            continue;
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
                err
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
  }

  // VERY Slow -- only for consistency checking purposes and debugging.
  // If snapshots=false, don't use snapshots.
  public value_no_cache(
    time: Date | undefined,
    snapshots: boolean = true
  ): Document {
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
  }

  // For testing/debugging.  Go through the complete patch history and
  // verify that all snapshots are correct (or not -- in which case say so).
  public validate_snapshots(): void {
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
  }

  // integer index of user who made the edit at given point in time.
  public user_id(time): number {
    const x = this.patch(time);
    if (x == null) {
      throw Error(`no edit at ${time}`);
    }
    return x.user_id;
  }

  public time_sent(time): Date | undefined {
    const x = this.patch(time);
    return x == null ? undefined : x.sent;
  }

  // Patch at a given point in time
  public patch(time): Patch | undefined {
    return this.times[time.valueOf()];
  }

  public versions(): Date[] {
    // Compute and cache result,then return it; result gets cleared when new patches added.
    if (this.versions_cache == null) {
      this.versions_cache = this.patches.map(x => x.time);
    }
    return this.versions_cache;
  }

  // Show the history of this document; used mainly for debugging purposes.
  public show_history({
    milliseconds,
    trunc,
    log
  }: {
    milliseconds?: boolean;
    trunc?: number;
    log?: Function;
  }) {
    if (milliseconds === undefined) {
      milliseconds = false;
    }
    if (trunc === undefined) {
      trunc = trunc ? trunc : 80;
    }
    if (log === undefined) {
      log = console.log;
    }
    let i: number = 0;
    let s: Document | undefined;
    const prev_cutoff: Date = this.newest_snapshot_time();
    let x: Patch;
    for (x of this.patches) {
      let tm: Date = x.time;
      let tm_show: number | string = milliseconds
        ? tm.valueOf()
        : tm.toLocaleString();
      log(
        "-----------------------------------------------------\n",
        i,
        x.user_id,
        tm_show,
        trunc_middle(JSON.stringify(x.patch), trunc)
      );
      if (s === undefined) {
        s = this.from_str(x.snapshot != null ? x.snapshot : "");
      }
      if (
        x.prev == null ||
        this.times[x.prev.valueOf()] ||
        x.prev <= prev_cutoff
      ) {
        s = s.apply_patch(x.patch);
      } else {
        log(`prev=${x.prev.valueOf()} is missing, so not applying this patch`);
      }
      log(
        x.snapshot ? "(SNAPSHOT) " : "           ",
        trunc_middle(s.to_str(), trunc).trim()
      );
      i += 1;
    }
  }

  /* If the number of patches since the most recent snapshot
     is >= 2*interval, we would make a snapshot at the patch
     that is interval steps forward from the most recent
     snapshot.  This function does not MAKE a snapshot; it just
     returns the time at which we must plan to make a snapshot. */
  public time_of_unmade_periodic_snapshot(interval: number): Date | undefined {
    const n = this.patches.length - 1;
    if (n < 2 * interval) {
      // definitely no need to make a snapshot
      return;
    }
    const end = n - 2 * interval;
    for (let i = n; i >= end; i--) {
      if (this.patches[i].snapshot != null) {
        if (i + 2 * interval <= n) {
          return this.patches[i + interval].time;
        } else {
          // found a relatively recent snapshot, so don't need
          // to make another one
          return;
        }
      }
    }
    // No snapshot found at all -- maybe old ones were deleted.
    // We return the time at which we should have the *newest* snapshot.
    // This is the largest multiple i of interval that is <= n - interval
    let i = Math.floor((n - interval) / interval) * interval;
    if (this.patches[i] != null) {
      return this.patches[i].time;
    }
  }

  // Times of all snapshots in memory on this client; these are
  // the only ones we need to worry about for offline patches...
  public snapshot_times(): Date[] {
    const v: Date[] = [];
    let t: string;
    for (t in this.all_snapshot_times) {
      v.push(new Date(parseInt(t)));
    }
    v.sort(cmp_Date);
    return v;
  }

  public newest_patch_time(): Date | undefined {
    if (this.patches.length === 0) {
      return;
    }
    return this.patches[this.patches.length - 1].time;
  }

  public count(): number {
    return this.patches.length;
  }
}

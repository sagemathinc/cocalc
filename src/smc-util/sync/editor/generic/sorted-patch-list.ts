/*
Sorted list of patches applied to a starting string/object.
*/

import { EventEmitter } from "events";

import { Document, Patch } from "./types";

import { cmp_Date } from "../../misc2";

import { Entry, PatchValueCache } from "./patch-value-cache";

const misc = require("smc-util/misc");

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
  private snapshot_times: { [time: string]: boolean } = {};

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
    delete this.snapshot_times;
  }

  /* Choose the next available time in ms that is congruent to m modulo n.
     The congruence condition is so that any time collision will have to be
     with a single person editing a document with themselves -- two different
     users are guaranteed to not collide.  Note: even if there is a collision,
     it will automatically fix itself very quickly. */
  public next_available_time(
    time: Date | number,
    m: number = 0,
    n: number = 1
  ): Date {
    let t: number;
    if (misc.is_date(time)) {
      t = time.valueOf();
    } else {
      t = time;
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
    //console.log("SortedPatchList.add: #{misc.to_json(patches)}")
    const v: Patch[] = [];
    let oldest = undefined;
    let x: Patch;
    for (x of patches) {
      let t: number = x.time.valueOf();
      const cur = this.times[t];
      if (cur != null) {
        // Hmm -- We already have a patch with this time.
        if (
          underscore.isEqual(cur.patch, x.patch) &&
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
        this.snapshot_times[t] = true;
      }
    }

    if (oldest != null) {
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
    for (t in this.snapshot_times) {
      let d: number = parseInt(t);
      if (d > t0) {
        t0 = t;
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
  public value(time?: Date, force?: boolean, without_times?: Date[]) {
    // oldest time that is skipped:
    let oldest_without_time: Date | undefined = undefined;
    // all skipped times.
    const without_times_set: { [time_since_epoch: number]: true } = {};

    if (without_times != null) {
      // Process without_times to get a map from time numbers to true.
      if (without_times.length > 0) {
        for (x of without_times) {
          // convert x to number (then string as key)
          without_times_set[x.valueOf()] = true;
          if (oldest_without_time == null || x < oldest_without_time) {
            oldest_without_time = x;
          }
        }
        if (time != null && time.valueOf() < oldest_without_time) {
          // requesting value at time before any oldest_without_time, so
          // is not relevant, so ignore.
          oldest_without_time = undefined;
          without_times = undefined;
          without_times_set.clear();
        }
      }
    }

    // we do not discard patch due to prev if prev is before this.
    const prev_cutoff: Date = this.newest_snapshot_time();

    // Determine oldest cached value (undefined if nothing cached)
    const oldest_cached_time: Date | undefined = this.cache.oldest_time();

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
      let cache: Entry;
      if (oldest_without_time != null) {
        // true makes "at most" strict, so <.
        cache = this.cache.newest_value_at_most(oldest_without_time, true);
      } else {
        cache = this.cache.newest_value_at_most(time);
      }
      let { value, start, time: cache_time } = cache;
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
        (time == null || start - cache.start >= 10)
      ) {
        // Newest -- or at least 10 patches needed to be applied -- so cache result
        this.cache.include(cache_time, value, start);
        this.cache.prune(
          Math.max(
            3,
            Math.min(
              Math.ceil(30000000 / value.length),
              MAX_PATCHLIST_CACHE_SIZE
            )
          )
        );
      }
    } else {
      // Cache is empty or doesn't have anything sufficiently old to be useful.
      // Find the newest snapshot at a time that is <= time.
      let value: Document = this.from_str(""); // default in case no snapshots
      let start: number = 0;
      for (let i = this.patches.length - 1; i >= 0; i--) {
        if (
          (time == null || this.patches[i].time <= time) &&
          this.patches[i].snapshot != null
        ) {
          if (force && cmp_Date(this.patches[i].time, time) === 0) {
            // If force is true we do NOT want to use the existing snapshot, since
            // the whole point is to force recomputation of it, as it is wrong.
            // Instead, we'll use the previous snapshot.
            continue;
          }
          // Found a patch with known snapshot that is as old as the time.
          // This is the base on which we will apply other patches to move forward
          // to the requested time.
          value = this.from_str(this.patches[i].snapshot);
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
        oldest_without_time == null &&
        (time == null || (cache_time && cache_start - start >= 10))
      ) {
        // Newest -- or at least 10 patches needed to be applied -- so
        // update the cache with our new known value
        this.cache.include(cache_time, value, cache_start);
        this.cache.prune(
          Math.max(
            3,
            Math.min(
              Math.ceil(30000000 / value.length),
              MAX_PATCHLIST_CACHE_SIZE
            )
          )
        );
      }
    }

    //console.log("value: time=#{new Date() - start_time}")
    // Use the following only for testing/debugging, since it will make everything VERY slow.
    //if @_value_no_cache(time) != value
    //    console.warn("value for time #{time-0} is wrong!")
    return value;
  }

  // VERY Slow -- only for consistency checking purposes and debugging.
  // If snapshots=false, don't use snapshots.
  _value_no_cache(time, snapshots = true) {
    let value = this.from_str(""); // default in case no snapshots
    let start = 0;
    const prev_cutoff = this.newest_snapshot_time();
    if (snapshots && this.patches.length > 0) {
      // otherwise the [..] notation below has surprising behavior
      for (
        let start1 = this.patches.length - 1, i = start1, asc = start1 <= 0;
        asc ? i <= 0 : i >= 0;
        asc ? i++ : i--
      ) {
        if (
          (time == null || +this.patches[i].time <= +time) &&
          this.patches[i].snapshot != null
        ) {
          // Found a patch with known snapshot that is as old as the time.
          // This is the base on which we will apply other patches to move forward
          // to the requested time.
          value = this.from_str(this.patches[i].snapshot);
          start = i + 1;
          break;
        }
      }
    }
    // Apply each of the patches we need to get from
    // value (the last snapshot) to time.
    for (let x of this.patches.slice(start, this.patches.length)) {
      if (time != null && x.time > time) {
        // Done -- no more patches need to be applied
        break;
      }
      if (x.prev == null || this.times[x.prev - 0] || +x.prev <= +prev_cutoff) {
        value = value.apply_patch(x.patch);
      } else {
        console.log("skipping patch due to prev", x);
      }
    }
    return value;
  }

  // For testing/debugging.  Go through the complete patch history and
  // verify that all snapshots are correct (or not -- in which case say so).
  _validate_snapshots() {
    let value;
    if (this.patches.length === 0) {
      return;
    }
    let i = 0;
    if (this.patches[0].snapshot != null) {
      i += 1;
      value = this.from_str(this.patches[0].snapshot);
    } else {
      value = this.from_str("");
    }
    for (let x of this.patches.slice(i)) {
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

  // integer index of user who made the edit at given point in time (or undefined)
  user_id(time) {
    return __guard__(this.patch(time), x => x.user_id);
  }

  time_sent(time) {
    return __guard__(this.patch(time), x => x.sent);
  }

  // patch at a given point in time
  // TODO: optimization -- this shouldn't be a linear search!!
  patch(time) {
    for (let x of this.patches) {
      if (+x.time === +time) {
        return x;
      }
    }
  }

  versions() {
    // Compute and cache result,then return it; result gets cleared when new patches added.
    if (this.versions_cache == null) {
      this.versions_cache = this.patches.map(x => x.time);
    }
    return this.versions_cache;
  }

  // Show the history of this document; used mainly for debugging purposes.
  show_history(opts = {}) {
    opts = defaults(opts, {
      milliseconds: false,
      trunc: 80,
      log: console.log
    });
    let s = undefined;
    let i = 0;
    const prev_cutoff = this.newest_snapshot_time();
    for (let x of this.patches) {
      var t;
      let tm = x.time;
      tm = opts.milliseconds ? tm - 0 : tm.toLocaleString();
      opts.log(
        "-----------------------------------------------------\n",
        i,
        x.user_id,
        tm,
        misc.trunc_middle(JSON.stringify(x.patch), opts.trunc)
      );
      if (s == null) {
        s = this.from_str(x.snapshot != null ? x.snapshot : "");
      }
      if (x.prev == null || this.times[x.prev - 0] || +x.prev <= +prev_cutoff) {
        t = s.apply_patch(x.patch);
      } else {
        opts.log(`prev=${x.prev} missing, so not applying`);
      }
      s = t;
      opts.log(
        x.snapshot ? "(SNAPSHOT) " : "           ",
        s != null
          ? JSON.stringify(misc.trunc_middle(s.to_str(), opts.trunc).trim())
          : undefined
      );
      i += 1;
    }
  }

  // If the number of patches since the most recent snapshot is >= 2*interval,
  // make a snapshot at the patch that is interval steps forward from
  // the most recent snapshot. This function returns the time at which we
  // must make a snapshot.
  time_of_unmade_periodic_snapshot(interval) {
    let i;
    let asc, end;
    const n = this.patches.length - 1;
    if (n < 2 * interval) {
      // definitely no need to make a snapshot
      return;
    }
    for (
      i = n, end = n - 2 * interval, asc = n <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      if (this.patches[i].snapshot != null) {
        if (i + interval + interval <= n) {
          return this.patches[i + interval].time;
        } else {
          // found too-recent snapshot so don't need to make another one
          return;
        }
      }
    }
    // No snapshot found at all -- maybe old ones were deleted.
    // We return the time at which we should have the *newest* snapshot.
    // This is the largest multiple i of interval that is <= n - interval
    i = Math.floor((n - interval) / interval) * interval;
    return this.patches[i] != null ? this.patches[i].time : undefined;
  }

  // Times of all snapshots in memory on this client; these are the only ones
  // we need to worry about for offline patches...
  snapshot_times() {
    return (() => {
      const result = [];
      for (let x of this.patches) {
        if (x.snapshot != null) {
          result.push(x.time);
        }
      }
      return result;
    })();
  }

  newest_patch_time() {
    return __guard__(this.patches[this.patches.length - 1], x => x.time);
  }

  count() {
    return this.patches.length;
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}

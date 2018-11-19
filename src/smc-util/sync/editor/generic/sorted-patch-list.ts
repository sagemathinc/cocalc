/*
Sorted list of patches applied to a starting string/object.
*/

// Make this bigger to make things faster... at the cost of
// using more memory.  TODO: use lru_cache instead, and
// an absolute memory threshhold?
const MAX_PATCHLIST_CACHE_SIZE = 20;

export class SortedPatchList extends EventEmitter {
  constructor(_from_str) {
    {
      // Hack: trick Babel/TypeScript into allowing this before super.
      if (false) {
        super();
      }
      let thisFn = (() => {
        return this;
      }).toString();
      let thisName = thisFn
        .slice(thisFn.indexOf("return") + 6 + 1, thisFn.indexOf(";"))
        .trim();
      eval(`${thisName} = this;`);
    }
    this.close = this.close.bind(this);
    this.next_available_time = this.next_available_time.bind(this);
    this.add = this.add.bind(this);
    this.newest_snapshot_time = this.newest_snapshot_time.bind(this);
    this.value = this.value.bind(this);
    this._value_no_cache = this._value_no_cache.bind(this);
    this._validate_snapshots = this._validate_snapshots.bind(this);
    this.user_id = this.user_id.bind(this);
    this.time_sent = this.time_sent.bind(this);
    this.patch = this.patch.bind(this);
    this.versions = this.versions.bind(this);
    this.show_history = this.show_history.bind(this);
    this.time_of_unmade_periodic_snapshot = this.time_of_unmade_periodic_snapshot.bind(
      this
    );
    this.snapshot_times = this.snapshot_times.bind(this);
    this.newest_patch_time = this.newest_patch_time.bind(this);
    this.count = this.count.bind(this);
    super();
    this._from_str = _from_str;
    this._patches = [];
    this._times = {};
    this._cache = new PatchValueCache();
    this._snapshot_times = {};
  }

  close() {
    this.removeAllListeners();
    delete this._patches;
    delete this._times;
    delete this._cache;
    return delete this._snapshot_times;
  }

  // Choose the next available time in ms that is congruent to m modulo n.
  // The congruence condition is so that any time collision will have to be
  // with a single person editing a document with themselves -- two different
  // users are guaranteed to not collide.  Note: even if there is a collision,
  // it will automatically fix itself very quickly.
  next_available_time(time, m = 0, n = 1) {
    let t;
    if (misc.is_date(time)) {
      t = time - 0;
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
    while (this._times[t] != null) {
      t += n;
    }
    return new Date(t);
  }

  _ensure_time_field_is_valid(patch, field) {
    // Ensure patch[field] is a valid Date object or undefined; if neither, returns true,
    // which means this patch is hopeless corrupt and should be ignored
    // (should be impossible given postgres data types)
    const val = patch[field];
    if (val == null || misc.is_date(val)) {
      return;
    }
    try {
      patch[field] = misc.ISO_to_Date(val);
      return false;
    } catch (err) {
      return true; // BAD
    }
  }

  add(patches) {
    if (patches.length === 0) {
      // nothing to do
      return;
    }
    //console.log("SortedPatchList.add: #{misc.to_json(patches)}")
    const v = [];
    let oldest = undefined;
    for (let x of patches) {
      if (x != null) {
        // ensure that time and prev fields is a valid Date object
        if (this._ensure_time_field_is_valid(x, "time")) {
          continue;
        }
        if (this._ensure_time_field_is_valid(x, "prev")) {
          continue;
        }
        var t = x.time - 0;
        const cur = this._times[t];
        if (cur != null) {
          // Note: cur.prev and x.prev are Date objects, so must put + before them to convert to numbers and compare.
          if (
            underscore.isEqual(cur.patch, x.patch) &&
            cur.user_id === x.user_id &&
            cur.snapshot === x.snapshot &&
            +cur.prev === +x.prev
          ) {
            // re-inserting exactly the same thing; nothing at all to do
            continue;
          } else {
            // adding snapshot or timestamp collision -- remove duplicate
            //console.log "overwriting patch #{misc.to_json(t)}"
            // remove patch with same timestamp from the sorted list of patches
            this._patches = this._patches.filter(y => y.time - 0 !== t);
            this.emit("overwrite", t);
          }
        }
        v.push(x);
        this._times[t] = x;
        if (oldest == null || oldest > x.time) {
          oldest = x.time;
        }
        if (x.snapshot != null) {
          this._snapshot_times[t] = true;
        }
      }
    }
    if (oldest != null) {
      this._cache.invalidate(oldest);
    }

    // this is O(n*log(n)) where n is the length of @_patches and patches;
    // better would be an insertion sort which would be O(m*log(n)) where m=patches.length...
    if (v.length > 0) {
      delete this._versions_cache;
      this._patches = this._patches.concat(v);
      return this._patches.sort(patch_cmp);
    }
  }

  newest_snapshot_time() {
    let t0 = 0;
    for (let t in this._snapshot_times) {
      t = parseInt(t);
      if (t > t0) {
        t0 = t;
      }
    }
    return new Date(t0);
  }

  /*
    value: Return the value of the string at the given (optional)
    point in time.  If the optional time is given, only include patches up
    to (and including) the given time; otherwise, return current value.

    If force is true, doesn't use snapshot at given input time, even if
    there is one; this is used to update snapshots in case of offline changes
    getting inserted into the changelog.

    If without_times is defined, it must be an array of Date objects; in that case
    the current value of the string is computed, but with all the patches
    at the given times in "without_times" ignored.  This is used elsewhere
    as a building block to implement undo.
    */
  value(time, force = false, without_times = undefined) {
    //start_time = new Date()

    let cache_time, start, value, without, x;
    if (time != null && !misc.is_date(time)) {
      // If the time is specified, verify that it is valid; otherwise, convert it to a valid time.
      time = misc.ISO_to_Date(time);
    }

    if (without_times != null) {
      // Process without_times to get a map from time numbers to true.
      if (!misc.is_array(without_times)) {
        throw Error("without_times must be an array");
      }
      if (without_times.length > 0) {
        const v = {};
        without = undefined;
        for (x of without_times) {
          if (!misc.is_date(x)) {
            throw Error("each without_times entry must be a date");
          }
          v[+x] = true; // convert to number
          if (without == null || x < without) {
            without = x;
          }
        }
        if (time != null && +time < without) {
          // requesting value at time before any without, so without is not relevant, so ignore.
          without = undefined;
          without_times = undefined;
        } else {
          without_times = v; // change to map from time in ms to true.
        }
      }
    }

    const prev_cutoff = this.newest_snapshot_time(); // we do not discard patch due to prev if prev is before this.

    // Determine oldest cached value
    const oldest_cached_time = this._cache.oldest_time(); // undefined if nothing cached
    // If the oldest cached value exists and is at least as old as the requested
    // point in time, use it as a base.
    if (
      oldest_cached_time != null &&
      (time == null || +time >= +oldest_cached_time) &&
      (without == null || +without > +oldest_cached_time)
    ) {
      // There is something in the cache, and it is at least as far back in time
      // as the value we want to compute now.
      let cache;
      if (without != null) {
        cache = this._cache.newest_value_at_most(without, true); // true makes "at most" strict, so <.
      } else {
        cache = this._cache.newest_value_at_most(time);
      }
      ({ value } = cache);
      ({ start } = cache);
      cache_time = cache.time;
      for (x of this._patches.slice(cache.start, this._patches.length)) {
        // all patches starting with the cached one
        if (time != null && x.time > time) {
          // Done -- no more patches need to be applied
          break;
        }
        if (
          x.prev == null ||
          this._times[x.prev - 0] ||
          +x.prev <= +prev_cutoff
        ) {
          if (without == null || (without != null && !without_times[+x.time])) {
            // apply patch x to update value to be closer to what we want
            value = value.apply_patch(x.patch);
          }
        }
        cache_time = x.time; // also record the time of the last patch we applied.
        start += 1;
      }
      if (without == null && (time == null || start - cache.start >= 10)) {
        // Newest -- or at least 10 patches needed to be applied -- so cache result
        this._cache.include(cache_time, value, start);
        this._cache.prune(
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
      value = this._from_str(""); // default in case no snapshots
      start = 0;
      if (this._patches.length > 0) {
        // otherwise the [..] notation below has surprising behavior
        for (
          let start1 = this._patches.length - 1, i = start1, asc = start1 <= 0;
          asc ? i <= 0 : i >= 0;
          asc ? i++ : i--
        ) {
          if (
            (time == null || +this._patches[i].time <= +time) &&
            this._patches[i].snapshot != null
          ) {
            if (force && +this._patches[i].time === +time) {
              // If force is true we do NOT want to use the existing snapshot, since
              // the whole point is to force recomputation of it, as it is wrong.
              // Instead, we'll use the previous snapshot.
              continue;
            }
            // Found a patch with known snapshot that is as old as the time.
            // This is the base on which we will apply other patches to move forward
            // to the requested time.
            value = this._from_str(this._patches[i].snapshot);
            start = i + 1;
            break;
          }
        }
      }
      // Apply each of the patches we need to get from
      // value (the last snapshot) to time.
      cache_time = 0;
      let cache_start = start;
      for (x of this._patches.slice(start, this._patches.length)) {
        if (time != null && x.time > time) {
          // Done -- no more patches need to be applied
          break;
        }
        // Apply a patch to move us forward.
        //console.log("applying patch #{i}")
        if (
          x.prev == null ||
          this._times[x.prev - 0] ||
          +x.prev <= +prev_cutoff
        ) {
          if (without == null || (without != null && !without_times[+x.time])) {
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
        without == null &&
        (time == null || (cache_time && cache_start - start >= 10))
      ) {
        // Newest -- or at least 10 patches needed to be applied -- so
        // update the cache with our new known value
        this._cache.include(cache_time, value, cache_start);
        this._cache.prune(
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
    let value = this._from_str(""); // default in case no snapshots
    let start = 0;
    const prev_cutoff = this.newest_snapshot_time();
    if (snapshots && this._patches.length > 0) {
      // otherwise the [..] notation below has surprising behavior
      for (
        let start1 = this._patches.length - 1, i = start1, asc = start1 <= 0;
        asc ? i <= 0 : i >= 0;
        asc ? i++ : i--
      ) {
        if (
          (time == null || +this._patches[i].time <= +time) &&
          this._patches[i].snapshot != null
        ) {
          // Found a patch with known snapshot that is as old as the time.
          // This is the base on which we will apply other patches to move forward
          // to the requested time.
          value = this._from_str(this._patches[i].snapshot);
          start = i + 1;
          break;
        }
      }
    }
    // Apply each of the patches we need to get from
    // value (the last snapshot) to time.
    for (let x of this._patches.slice(start, this._patches.length)) {
      if (time != null && x.time > time) {
        // Done -- no more patches need to be applied
        break;
      }
      if (
        x.prev == null ||
        this._times[x.prev - 0] ||
        +x.prev <= +prev_cutoff
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
  _validate_snapshots() {
    let value;
    if (this._patches.length === 0) {
      return;
    }
    let i = 0;
    if (this._patches[0].snapshot != null) {
      i += 1;
      value = this._from_str(this._patches[0].snapshot);
    } else {
      value = this._from_str("");
    }
    for (let x of this._patches.slice(i)) {
      value = value.apply_patch(x.patch);
      if (x.snapshot != null) {
        const snapshot_value = this._from_str(x.snapshot);
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
    for (let x of this._patches) {
      if (+x.time === +time) {
        return x;
      }
    }
  }

  versions() {
    // Compute and cache result,then return it; result gets cleared when new patches added.
    return this._versions_cache != null
      ? this._versions_cache
      : (this._versions_cache = this._patches.map(x => x.time));
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
    for (let x of this._patches) {
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
        s = this._from_str(x.snapshot != null ? x.snapshot : "");
      }
      if (
        x.prev == null ||
        this._times[x.prev - 0] ||
        +x.prev <= +prev_cutoff
      ) {
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
    const n = this._patches.length - 1;
    if (n < 2 * interval) {
      // definitely no need to make a snapshot
      return;
    }
    for (
      i = n, end = n - 2 * interval, asc = n <= end;
      asc ? i <= end : i >= end;
      asc ? i++ : i--
    ) {
      if (this._patches[i].snapshot != null) {
        if (i + interval + interval <= n) {
          return this._patches[i + interval].time;
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
    return this._patches[i] != null ? this._patches[i].time : undefined;
  }

  // Times of all snapshots in memory on this client; these are the only ones
  // we need to worry about for offline patches...
  snapshot_times() {
    return (() => {
      const result = [];
      for (let x of this._patches) {
        if (x.snapshot != null) {
          result.push(x.time);
        }
      }
      return result;
    })();
  }

  newest_patch_time() {
    return __guard__(this._patches[this._patches.length - 1], x => x.time);
  }

  count() {
    return this._patches.length;
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}

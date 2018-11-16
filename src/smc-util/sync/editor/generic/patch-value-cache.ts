/*
The PatchValueCache is used to cache values returned
by SortedPatchList.value.  Caching is critical, since otherwise
the client may have to apply hundreds of patches after ever
few keystrokes, which would make SMC unusable.  Also, the
history browser is very painful to use without caching.
*/
const MAX_PATCHLIST_CACHE_SIZE = 20;

export class PatchValueCache {
  constructor() {
    this.invalidate = this.invalidate.bind(this);
    this.prune = this.prune.bind(this);
    this.include = this.include.bind(this);
    this.newest_value_at_most = this.newest_value_at_most.bind(this);
    this.get = this.get.bind(this);
    this.oldest_time = this.oldest_time.bind(this);
    this.size = this.size.bind(this);
    this.cache = {};
  }

  // Remove everything from the value cache that has timestamp >= time.
  // If time not defined, removes everything, thus emptying the cache.
  invalidate(time) {
    if (time == null) {
      this.cache = {};
      return;
    }
    const time0 = time - 0;
    for (let tm in this.cache) {
      const _ = this.cache[tm];
      if (tm >= time0) {
        delete this.cache[tm];
      }
    }
  }

  // Ensure the value cache doesn't have too many entries in it by
  // removing all but n of the ones that have not been accessed recently.
  prune(n) {
    let x;
    const v = [];
    for (let time in this.cache) {
      x = this.cache[time];
      v.push({ time, last_used: x.last_used });
    }
    if (v.length <= n) {
      // nothing to do
      return;
    }
    v.sort((a, b) => misc.cmp_Date(a.last_used, b.last_used));
    for (x of v.slice(0, v.length - n)) {
      delete this.cache[x.time];
    }
  }

  // Include the given value at the given point in time, which should be
  // the output of @value(time), and should involve applying all patches
  // up to @_patches[start-1].
  include(time, value, start) {
    this.cache[time - 0] = { time, value, start, last_used: new Date() };
  }

  // Return the newest value x with x.time <= time in the cache as an object
  //    x={time:time, value:value, start:start},
  // where @value(time) is the given value, and it was obtained
  // by applying the elements of @_patches up to @_patches[start-1]
  // Return undefined if there are no cached values.
  // If time is undefined, returns the newest value in the cache.
  // If strict is true, returns newest value at time strictly older than time
  newest_value_at_most(time, strict = false) {
    const v = misc.keys(this.cache);
    if (v.length === 0) {
      return;
    }
    v.sort(misc.cmp);
    v.reverse();
    if (time == null) {
      return this.get(v[0]);
    }
    const time0 = time - 0;
    for (let t of v) {
      if ((!strict && t <= time0) || (strict && t < time0)) {
        return this.get(t);
      }
    }
  }

  // Return cached value corresponding to the given point in time.
  // Here time must be either a new Date() object, or a number (ms since epoch).
  // If there is nothing in the cache for the given time, returns undefined.
  // Do NOT mutate the returned value.
  get(time) {
    if (typeof time !== "number") {
      // also allow dates
      time = time - 0;
    }
    const x = this.cache[time];
    if (x == null) {
      return;
    }
    x.last_used = new Date(); // this is only for the client cache, so fine to use browser's clock
    return x;
  }

  oldest_time() {
    const v = misc.keys(this.cache);
    if (v.length === 0) {
      return;
    }
    v.sort(misc.cmp);
    return new Date(parseInt(v[0]));
  }

  // Number of cached values
  size() {
    return misc.len(this.cache);
  }
}

/*
The PatchValueCache is used to cache values returned
by SortedPatchList.value.  Caching is critical, since otherwise
the client may have to apply hundreds of patches after ever
few keystrokes, which would make SMC unusable.  Also, the
history browser is very painful to use without caching.
*/

import { cmp_Date, keys, cmp, len } from "smc-util/misc2.ts";

// Make this bigger to make things faster... at the cost of
// using more memory.  TODO: use lru_cache instead, and
// an absolute memory threshhold?
const MAX_PATCHLIST_CACHE_SIZE = 20;

interface Entry {
  time: Date;
  value: any;
  start: number;
  last_used: Date;
}

export class PatchValueCache {
  // keys in the cache are integers converted to strings.
  private cache: { [time: string]: Entry } = {};

  // Remove everything from the value cache that has timestamp >= time.
  // If time not defined, removes everything, thus emptying the cache.
  invalidate(time: Date | undefined): void {
    if (time == null) {
      this.cache = {};
      return;
    }
    const time0: number = time.valueOf();
    for (let tm: string in this.cache) {
      if (parseInt(tm) >= time0) {
        delete this.cache[tm];
      }
    }
  }

  // Ensure the value cache doesn't have too many entries in it by
  // removing all but n of the ones that have not been accessed recently.
  prune(n: number): void {
    if (this.size() <= n) {
      // nothing to do
      return;
    }
    const v: { time: string; last_used: Date }[] = [];
    for (let time: string in this.cache) {
      let x = this.cache[time];
      if (x != null) {
        v.push({ time, last_used: x.last_used });
      }
    }
    v.sort((a, b) => cmp_Date(a.last_used, b.last_used));
    // Delete oldest n entries.
    for (let x of v.slice(0, v.length - n)) {
      delete this.cache[x.time];
    }
  }

  // Include the given value at the given point in time, which should be
  // the output of this.value(time), and should involve applying all patches
  // up to this.patches[start-1].
  include(time: Date, value: any, start: number) {
    this.cache[`${time.valueOf()}`] = {
      time,
      value,
      start,
      last_used: new Date()
    };
  }

  private keys() : number[] {
    return keys(this.cache).map(x => parseInt(x));;
  }

  /* Return the newest value x with x.time <= time in the cache as an object

        x={time:time, value:value, start:start},

     where @value(time) is the given value, and it was obtained
     by applying the elements of @_patches up to @_patches[start-1]
     Return undefined if there are no cached values.
     If time is undefined, returns the newest value in the cache.
     If strict is true, returns newest value at time strictly older than time
  */
  newest_value_at_most(
    time?: Date,
    strict: boolean = false
  ): Entry | undefined {
    const v: number[] = this.keys();
    if (v.length === 0) {
      return;
    }
    v.sort(cmp);
    v.reverse();
    if (time == null) {
      return this.get(v[0]);
    }
    const time0 = time.valueOf();
    for (let t of v) {
      if ((!strict && t <= time0) || (strict && t < time0)) {
        return this.get(t);
      }
    }
  }

  // Return cached entry corresponding to the given point in time.
  // Here time must be either a new Date() object, or a number (ms since epoch).
  // If there is nothing in the cache for the given time, returns undefined.
  // ** Do NOT mutate the returned value. **
  get(time: Date | number): Entry | undefined {
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

  oldest_time(): Date {
    const v = this.keys();
    if (v.length === 0) {
      return;
    }
    v.sort(cmp);
    return new Date(v[0]);
  }

  // Number of cached values
  size(): number {
    return len(this.cache);
  }
}

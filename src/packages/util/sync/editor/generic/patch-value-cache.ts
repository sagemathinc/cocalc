/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The PatchValueCache is used to cache values returned
by SortedPatchList.value.  Caching is critical, since otherwise
the client may have to apply hundreds of patches after ever
few keystrokes, which would make CoCalc unusable.  Also, the
history browser is very painful to use without caching.
*/

import { cmp_Date, keys, cmp, len } from "../../../misc";
import { Document } from "./types";

export interface Entry {
  time: Date;
  value: Document;
  start: number;
  last_used: Date;
}

export class PatchValueCache {
  // keys in the cache are integers converted to strings.
  private cache: { [time: string]: Entry } = {};

  // Remove everything from the value cache that has timestamp >= time.
  // If time not defined, removes everything, thus emptying the cache.
  public invalidate(time: Date): void {
    const time0: number = time.valueOf();
    for (const time in this.cache) {
      if (parseInt(time) >= time0) {
        delete this.cache[time];
      }
    }
  }

  // Ensure the value cache doesn't have too many entries in it by
  // removing all but n of the ones that have not been accessed recently.
  public prune(n: number): void {
    if (this.size() <= n) {
      // nothing to do
      return;
    }
    const v: { time: string; last_used: Date }[] = [];
    for (const time in this.cache) {
      const x = this.cache[time];
      if (x != null) {
        v.push({ time, last_used: x.last_used });
      }
    }
    v.sort((a, b) => cmp_Date(a.last_used, b.last_used));
    // Delete oldest n entries.
    for (const x of v.slice(0, v.length - n)) {
      delete this.cache[x.time];
    }
  }

  // Include the given value at the given point in time, which should be
  // the output of this.value(time), and should involve applying all patches
  // up to this.patches[start-1].
  public include(time: Date, value: Document, start: number) {
    this.cache[`${time.valueOf()}`] = {
      time,
      value,
      start,
      last_used: new Date(),
    };
  }

  private keys(): number[] {
    return keys(this.cache).map((x) => parseInt(x));
  }

  /* Return the newest value x with x.time <= time in the cache as an object

        x={time:time, value:value, start:start},

     where this.value(time) is the given value, and it was obtained
     by applying the elements of this.patches up to this.patches[start-1]
     Return undefined if there are no cached values.
     If time is undefined, returns the newest value in the cache.
     If strict is true, returns newest value at time strictly older than time
  */
  public newest_value_at_most(
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
    for (const t of v) {
      if ((!strict && t <= time0) || (strict && t < time0)) {
        return this.get(t);
      }
    }
  }

  /* Return cached entry corresponding to the given point in time.
     Here time must be either a new Date() object, or a number (ms since epoch).
     If there is nothing in the cache for the given time, returns undefined.
     ** YOU BETTER NOT mutate the returned value! **  It's not a copy!!
  */
  public get(time: Date | number): Entry | undefined {
    if (typeof time !== "number") {
      // also allow dates
      time = time.valueOf();
    }
    const x = this.cache[time];
    if (x == null) {
      return;
    }
    x.last_used = new Date(); // this is only for the client cache, so fine to use browser's clock
    return x;
  }

  public oldest_time(): Date | undefined {
    const v = this.keys();
    if (v.length === 0) {
      return;
    }
    v.sort(cmp);
    return new Date(v[0]);
  }

  // Number of cached values
  public size(): number {
    return len(this.cache);
  }
}

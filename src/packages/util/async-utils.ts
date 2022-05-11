/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Some async utils.

(Obviously should be moved somewhere else when the dust settles!)

The two helpful async/await libraries I found are:

   - https://github.com/hunterloftis/awaiting
   - https://github.com/masotime/async-await-utils

*/

import * as awaiting from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";

// turns a function of opts, which has a cb input into
// an async function that takes an opts with no cb as input; this is just like
// awaiting.callback, but for our functions that take opts.
// WARNING: this is different than callback from awaiting, which
// on which you do:   callback(f, args...)
// With callback_opts, you do:   callback_opts(f)(opts)
// TODO: maybe change this everwhere to callback_opts(f, opts) for consistency!
export function callback_opts(f: Function) {
  return async function (opts?: any): Promise<any> {
    if (opts === undefined) {
      opts = {};
    }
    function g(cb: Function) {
      opts.cb = cb;
      f(opts);
    }
    return await awaiting.callback(g);
  };
}

/* retry_until_success keeps calling an async function f with
  exponential backoff until f does NOT raise an exception.
  Then retry_until_success returns whatever f returned.
*/

interface RetryUntilSuccess<T> {
  f: () => Promise<T>; // an async function that takes no input.
  start_delay?: number; // milliseconds -- delay before calling second time.
  max_delay?: number; // milliseconds -- delay at most this amount between calls
  max_tries?: number; // maximum number of times to call f
  max_time?: number; // milliseconds -- don't call f again if the call would start after this much time from first call
  factor?: number; // multiply delay by this each time
  log?: Function; // optional verbose logging function
  desc?: string; // useful for making error messages better.
}

export async function retry_until_success<T>(
  opts: RetryUntilSuccess<T>
): Promise<T> {
  if (!opts.start_delay) opts.start_delay = 100;
  if (!opts.max_delay) opts.max_delay = 20000;
  if (!opts.factor) opts.factor = 1.4;

  let next_delay: number = opts.start_delay;
  let tries: number = 0;
  const start_time: number = new Date().valueOf();
  let last_exc: Error | undefined;

  // Return nonempty string if time or tries exceeded.
  function check_done(): string {
    if (
      opts.max_time &&
      next_delay + new Date().valueOf() - start_time > opts.max_time
    ) {
      return "maximum time exceeded";
    }
    if (opts.max_tries && tries >= opts.max_tries) {
      return "maximum tries exceeded";
    }
    return "";
  }

  while (true) {
    try {
      return await opts.f();
    } catch (exc) {
      //console.warn('retry_until_success', exc);
      if (opts.log !== undefined) {
        opts.log("failed ", exc);
      }
      // might try again -- update state...
      tries += 1;
      next_delay = Math.min(opts.max_delay, opts.factor * next_delay);
      // check if too long or too many tries
      const err = check_done();
      if (err) {
        // yep -- game over, throw an error
        let e;
        if (last_exc) {
          e = Error(`${err} -- last error was ${last_exc} -- ${opts.desc}`);
        } else {
          e = Error(`${err} -- ${opts.desc}`);
        }
        //console.warn(e);
        throw e;
      }
      // record exception so can use it later.
      last_exc = exc;

      // wait before trying again
      await awaiting.delay(next_delay);
    }
  }
}

import { EventEmitter } from "events";

/* Wait for an event emitter to emit any event at all once.
   Returns array of args emitted by that event.
   If timeout_ms is 0 (the default) this can wait an unbounded
   amount of time.  That's intentional and does make sense
   in our applications. */
export async function once(
  obj: EventEmitter,
  event: string,
  timeout_ms: number = 0
): Promise<any> {
  if (!(obj instanceof EventEmitter)) {
    // just in case typescript doesn't catch something:
    throw Error("obj must be an EventEmitter");
  }
  if (timeout_ms > 0) {
    // just to keep both versions more readable...
    return once_with_timeout(obj, event, timeout_ms);
  }
  let val: any[] = [];
  function wait(cb: Function): void {
    obj.once(event, function (...args): void {
      val = args;
      cb();
    });
  }
  await awaiting.callback(wait);
  return val;
}

async function once_with_timeout(
  obj: EventEmitter,
  event: string,
  timeout_ms: number
): Promise<any> {
  let val: any[] = [];
  function wait(cb: Function): void {
    function fail(): void {
      obj.removeListener(event, handler);
      cb("timeout");
    }
    const timer = setTimeout(fail, timeout_ms);
    function handler(...args): void {
      clearTimeout(timer);
      val = args;
      cb();
    }
    obj.once(event, handler);
  }
  await awaiting.callback(wait);
  return val;
}

// Alternative to callback_opts that behaves like the
// callback defined in awaiting.
export async function callback2(f: Function, opts: any = {}): Promise<any> {
  function g(cb): void {
    opts.cb = cb;
    f(opts);
  }
  return await awaiting.callback(g);
}

export function reuse_in_flight_methods(
  obj: any,
  method_names: string[]
): void {
  for (const method_name of method_names) {
    obj[method_name] = reuseInFlight(obj[method_name].bind(obj));
  }
}

// Cancel pending throttle or debounce, where f is the
// output of underscore.throttle (or debounce).  Safe to call
// with f null or a normal function.
export function cancel_scheduled(f: any): void {
  if (f != null && f.cancel != null) {
    f.cancel();
  }
}

// WARNING -- not tested
export async function async_as_callback(
  f: Function,
  cb: Function,
  ...args
): Promise<void> {
  try {
    await f(...args);
    cb();
  } catch (err) {
    cb(err);
  }
}

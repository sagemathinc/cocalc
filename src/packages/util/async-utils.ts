/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Some async utils.

(Obviously should be moved somewhere else when the dust settles!)

The two helpful async/await libraries I found are:

   - https://github.com/hunterloftis/awaiting
   - https://github.com/masotime/async-await-utils

*/

import * as awaiting from "awaiting";
import { reuseInFlight } from "./reuse-in-flight";

interface RetryOptions {
  start?: number;
  decay?: number;
  max?: number;
  min?: number;
  timeout?: number;
  log?: (...args) => void;
}

// loop calling the async function f until it returns true.
// It optionally can take a timeout, which if hit it will
// throw Error('timeout').   retry_until_success below is an
// a variant of this pattern keeps retrying until f doesn't throw.
// The input function f must always return true or false,
// which helps a lot to avoid bugs.
export async function until(
  f: (() => Promise<boolean>) | (() => boolean),
  {
    start = 500,
    decay = 1.3,
    max = 15000,
    min = 50,
    timeout = 0,
    log,
  }: RetryOptions = {},
) {
  const end = timeout ? Date.now() + timeout : undefined;
  let d = Math.max(min, start);
  while (end === undefined || Date.now() < end) {
    const x = await f();
    if (x) {
      return;
    }
    if (end) {
      d = Math.max(min, Math.min(end - Date.now(), Math.min(max, d * decay)));
    } else {
      d = Math.max(min, Math.min(max, d * decay));
    }
    log?.(`will retry in ${Math.round(d / 1000)} seconds`);
    await awaiting.delay(d);
  }
  log?.(`FAILED: timeout -- ${timeout} ms`);
  throw Error(`timeout -- ${timeout} ms`);
}

export { asyncDebounce, asyncThrottle } from "./async-debounce-throttle";

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
  opts: RetryUntilSuccess<T>,
): Promise<T> {
  if (!opts.start_delay) opts.start_delay = 100;
  if (!opts.max_delay) opts.max_delay = 20000;
  if (!opts.factor) opts.factor = 1.4;

  let next_delay: number = opts.start_delay;
  let tries: number = 0;
  const start_time: number = Date.now();
  let last_exc: Error | undefined;

  // Return nonempty string if time or tries exceeded.
  function check_done(): string {
    if (opts.max_time && next_delay + Date.now() - start_time > opts.max_time) {
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
          e = Error(`${err} -- last error was '${last_exc}' -- ${opts.desc}`);
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
import { CB } from "./types/database";

export class TimeoutError extends Error {
  code: number;
  constructor(mesg: string) {
    super(mesg);
    this.code = 408;
  }
}

/* Wait for an event emitter to emit any event at all once.
   Returns array of args emitted by that event.
   If timeout_ms is 0 (the default) this can wait an unbounded
   amount of time.  That's intentional and does make sense
   in our applications.
   If timeout_ms is nonzero and event doesn't happen an
   exception is thrown.
   If the obj throws 'closed' before the event is emitted,
   then this throws an error, since clearly event can never be emitted.
   */
export async function once(
  obj: EventEmitter,
  event: string,
  timeout_ms: number | undefined = 0,
): Promise<any> {
  if (obj == null) throw Error("once -- obj is undefined");
  if (timeout_ms == null) {
    // clients might explicitly pass in undefined, but below we expect 0 to mean "no timeout"
    timeout_ms = 0;
  }
  if (typeof obj.once != "function")
    throw Error("once -- obj.once must be a function");

  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | undefined;

    function cleanup() {
      obj.removeListener(event, onEvent);
      obj.removeListener("closed", onClosed);
      if (timer) clearTimeout(timer);
    }

    function onEvent(...args: any[]) {
      cleanup();
      resolve(args);
    }

    function onClosed() {
      cleanup();
      reject(new TimeoutError(`once: "${event}" not emitted before "closed"`));
    }

    function onTimeout() {
      cleanup();
      reject(
        new TimeoutError(
          `once: timeout of ${timeout_ms}ms waiting for "${event}"`,
        ),
      );
    }

    obj.once(event, onEvent);
    obj.once("closed", onClosed);

    if (timeout_ms > 0) {
      timer = setTimeout(onTimeout, timeout_ms);
    }
  });
}

// Alternative to callback_opts that behaves like the callback defined in awaiting.
// Pass in the type of the returned value, and it will be inferred.
export async function callback2<R = any>(
  f: (opts) => void,
  opts?: object,
): Promise<R> {
  const optsCB = (opts ?? {}) as typeof opts & { cb: CB<R> };
  function g(cb: CB<R>): void {
    optsCB.cb = cb;
    f(optsCB);
  }
  return await awaiting.callback(g);
}

export function reuse_in_flight_methods(
  obj: any,
  method_names: string[],
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

// From https://stackoverflow.com/questions/70470728/how-can-i-execute-some-async-tasks-in-parallel-with-limit-in-generator-function
export async function mapParallelLimit(values, fn, max = 10) {
  const promises = new Set();

  for (const i in values) {
    while (promises.size >= max) {
      await Promise.race(promises.values());
    }

    let promise = fn(values[i], i).finally(() => promises.delete(promise));
    promises.add(promise);
  }

  return Promise.all(promises.values());
}

export async function parallelHandler({
  iterable,
  limit,
  handle,
}: {
  iterable: AsyncIterable<any>;
  limit: number;
  handle: (any) => Promise<void>;
}) {
  const promiseQueue: Promise<void>[] = [];
  for await (const mesg of iterable) {
    const promise = handle(mesg).then(() => {
      // Remove the promise from the promiseQueue once done
      promiseQueue.splice(promiseQueue.indexOf(promise), 1);
    });
    promiseQueue.push(promise);
    // If we reached the PARALLEL limit, wait for one of the
    // promises to resolve
    if (promiseQueue.length >= limit) {
      await Promise.race(promiseQueue);
    }
  }
  // Wait for all remaining promises to finish
  await Promise.all(promiseQueue);
}

// use it like this:
//   resp = await withTimeout(promise, 3000);
// and if will throw a timeout if promise takes more than 3s to resolve,
// though of course whatever code is running in promise doesn't actually
// get interrupted.
export async function withTimeout(p: Promise<any>, ms: number) {
  let afterFired = false;
  p.catch((err) => {
    if (afterFired) {
      console.warn("WARNING: withTimeout promise rejected", err);
    }
  });
  let to;
  return Promise.race([
    p,
    new Promise(
      (_, reject) =>
        (to = setTimeout(() => {
          afterFired = true;
          reject(new Error("timeout"));
        }, ms)),
    ),
  ]).finally(() => clearTimeout(to));
}

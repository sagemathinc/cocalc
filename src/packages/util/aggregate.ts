/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Async aggregate.

Use like this:

    g = aggregate (opts) ->
        [bunch of code here...]

Given a function f that takes an object of the form

    {foo:?, bar:?, other:?,..., cb:...}

as input -- where everything except cb is JSON-able, make a new function g that
takes as input

   {foo:?, bar:?, other:?,..., cb:..., aggregate:?}

If you call g without setting aggregate, then f is just called as usual.

If you call g with aggregate set to a nondecreasing input (e.g., sequence
numbers or timestamp), then f only gets evaluated *once*.   E.g., if you do

    g(x:0, aggregate:0, cb:a)
    ...
    g(x:0, aggregate:0, cb:b)
    g(x:1, aggregate:0, cb:c)
    ...
    g(x:0, aggregate:1, cb:d)
    g(x:0, aggregate:0, cb:e)   # no reason to do this; it's best if aggregate is a nondecreasing sequence (NOT required though).

Then:

   - f(x:0,cb:?) gets called once and both a and b are called with that one result.
   - f(x:1,cb:?) gets called once and c called with the result. This happens in
     parallel with the above call to f(x:0,cb:?).
   - f(x:0,cb:?) gets called once MORE and d is called with the result.
     This final call only happens once the call to f(x:0,cb:?) finishes.
   - g(x:0, aggregate:0, cb:e) results in just getting added to the cb's for f(x:0,cb:?),
     if that call is still running; if not, f may or may not get called again, depending
     on how much later (recent results are cached).

OPTIONS:

You can also do

     aggregate(options, (opts) -> ...)

Where options is an object.

    options = {omit: ['keys', 'of', 'opts', 'to', 'omit', 'in', 'comparing', 'inputs']}

*/

const json_stable = require("json-stable-stringify");

import { copy_without, field_cmp } from "./misc";

// To avoid using up too much memory, results are cached at most this long
// (so long as function is called periodically to clear the cache... if not,
// no point in clearing, since won't grow much.)
const DONE_CACHE_TIMEOUT_MS = 60000;

function clear_old(done) {
  const now = Date.now();
  for (let key in done) {
    const s = done[key];
    if (now - s.time >= DONE_CACHE_TIMEOUT_MS) {
      delete done[key];
    }
  }
}

// Return true if a<=b.
// Except... a special case.  If a is an object with a value attribute,
// return true only if a.value is equal to b.value.
// We use this so that aggregate can get recomputed for any change in aggregate,
// instead of requiring an increasing sequence of aggregate values.
function leq(a, b) {
  if (typeof a === "object" && a.value != null) {
    return a.value === b.value;
  }
  return a <= b;
}

export function aggregate(options, f?: any) {
  if (f == null) {
    f = options;
    options = undefined;
  }
  if (typeof f !== "function") {
    throw Error("f must be a function");
  }

  const state = {}; // in the closure, so scope is that of this function we are making below.
  const done = {};
  const omitted_fields = ["cb", "aggregate", "streamCB"];
  if (options != null && options.omit) {
    for (let field of options.omit) {
      omitted_fields.push(field);
    }
  }

  function just_call_f(opts) {
    // Fallback behavior **without aggregate**. Used below when aggregate not set.
    // This just deletes aggregate from opts and calls f.
    delete opts.aggregate;
    f(opts);
  }

  function aggregate_call_f(opts) {
    // Key is a string that determines the inputs to f **that matter**.
    const key: string = json_stable(copy_without(opts, omitted_fields));
    // Check state
    const current = state[key];
    const recent = done[key];
    if (recent != null && leq(opts.aggregate, recent.aggregate)) {
      // result is known from a previous call.
      // Let the normal callback flow handle streaming events - don't bypass executeStream's logic
      opts.cb(...recent.args);
      return;
    }
    if (current != null) {
      // Call already in progress with given exactly the same inputs.
      if (leq(opts.aggregate, current.aggregate)) {
        // already running with old enough aggregate value -- just wait and return as part of that
        current.callbacks.push(opts.cb);
      } else {
        // already running, but newer aggregate value.  We will run this one once the current one is done.
        current.next.push(opts);
      }
      return;
    }

    // Setup state, do the call, and call callbacks when done, then possibly
    // call f again in case new requests came in during the call.

    // Nothing is going on right now with the given key.  Evaluate f.
    state[key] = {
      aggregate: opts.aggregate, // aggregate value for current run
      next: [], // things requested to be run in the future -- these are opts with same key
      callbacks: [opts.cb], // callbacks to call when this evaluation completes
      time: new Date(),
      args: undefined,
    };

    // This gets called when f completes.
    opts.cb = function (...args) {
      const { callbacks, next } = state[key];
      done[key] = state[key];
      done[key].args = args;
      clear_old(done);
      delete state[key];
      // Call all the callbacks for which the result of running f is sufficient.
      for (let cb of callbacks) {
        if (typeof cb === "function") {
          cb(...args);
        }
      }
      if (next.length > 0) {
        // Setup new call, since new requests came in during this call to f, which couldn't
        // be handled via this call.
        // Sort by aggregate from bigger to small
        next.sort(field_cmp("aggregate"));
        next.reverse();
        // And just do the calls, which will add these to the new state[key].callbacks
        next.map((opts0) => aggregate_call_f(opts0));
      }
    };

    // Finaly actually run f, which eventually calls opts.cb, which is defined directly above.
    f(opts);
  }

  // Construct and return new function: if called with aggregate not
  // set or false-ish, just calls f.  Othwerwise, aggregates calls.
  return function (opts) {
    if (opts.aggregate == null) {
      just_call_f(opts);
    } else {
      aggregate_call_f(opts);
    }
  };
}

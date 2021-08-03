/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is a convenience function to provide as a callback when working interactively.
function _done(n, ...args): Function | void {
  const start_time = new Date().valueOf();
  const f = function (...args) {
    if (n !== 1) {
      try {
        args = [JSON.stringify(args, null, n)];
      } catch (error) {}
    }
    // do nothing
    console.log(
      `*** TOTALLY DONE! (${
        (new Date().valueOf() - start_time) / 1000
      }s since start) `,
      ...Array.from(args)
    );
  };
  if (args.length > 0) {
    f(...Array.from(args || []));
  } else {
    return f;
  }
}

export function done(...args): Function | void {
  return _done(0, ...Array.from(args));
}
export function done1(...args): Function | void {
  return _done(1, ...Array.from(args));
}
export function done2(...args): Function | void {
  return _done(2, ...Array.from(args));
}

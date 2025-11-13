/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This code is a fork of the ISC licensed https://github.com/masotime/async-await-utils
// Only for the reuseInFlight function without any dependencies.

interface Config {
  createKey: (args: any[]) => string;
  ignoreSingleUndefined: boolean;
}

const DEFAULT_CONFIG: Config = {
  createKey(args) {
    return JSON.stringify(args);
  },
  ignoreSingleUndefined: false,
} as const;

// for a given Promise-generating function, track each execution by the stringified
// arguments. if the function is called again with the same arguments, then instead
// of generating a new promise, an existing in-flight promise is used instead. This
// prevents unnecessary repetition of async function calls while the same function
// is still in flight.
export function reuseInFlight<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  configArg: Partial<Config> = {},
) {
  const config: Config = { ...DEFAULT_CONFIG, ...configArg };

  const inflight: Record<string, Promise<T>> = {};

  return function debounced(...args: any[]): Promise<T> {
    if (
      config.ignoreSingleUndefined &&
      args.length === 1 &&
      args[0] === undefined
    ) {
      console.warn("Ignoring single undefined arg (reuseInFlight)");
      args = [];
    }

    const key = config.createKey(args);

    if (!Object.prototype.hasOwnProperty.call(inflight, key)) {
      // WE DO NOT AWAIT, we are storing the promise itself
      inflight[key] = asyncFn(...args).then(
        (results) => {
          // self invalidate
          delete inflight[key];
          return results;
        },
        (err) => {
          // still self-invalidate, then rethrow
          delete inflight[key];
          throw err;
        },
      );
    }

    // ... and return it
    return inflight[key] as Promise<T>;
  };
}

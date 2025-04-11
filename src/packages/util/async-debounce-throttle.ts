/*
I couldn't find a good npm library to debounce an async function, but this
code from GPT-4o works well.

AUTHOR: GPT-4o

*/

/*
The regular lodash debounce function does not return a promise, but you
can create your own wrapper to handle this.

### Key Points:

1. **Promise Wrapping**: Use a promise to ensure `await bar()` doesn't resolve until
after the actual function executes.

2. **Queue Maintenance**: Utilize a queue (`resolveQueue`) to store and resolve
promises after the debounced function executes.

3. **Custom Debounce Wrapper**: The `debouncePromise` function handles the
integration of promises with `lodash` debounce.
*/

import {
  debounce,
  throttle,
  type DebounceSettings,
  type ThrottleSettings,
} from "lodash";

export function asyncDebounce(
  func: (...args: any[]) => Promise<any>,
  wait: number,
  options?: DebounceSettings,
): (...args: any[]) => Promise<any> {
  let resolveQueue: Array<() => void> = [];

  const debounced = debounce(
    async (...args: any[]) => {
      await func(...args);
      // Resolve all stored promises
      resolveQueue.forEach((resolve) => resolve());
      resolveQueue = [];
    },
    wait,
    options,
  );

  return (...args: any[]) =>
    new Promise<void>((resolve) => {
      resolveQueue.push(resolve);
      debounced(...args);
    });
}

export function asyncThrottle(
  func: (...args: any[]) => Promise<any>,
  wait: number,
  options?: ThrottleSettings,
): (...args: any[]) => Promise<any> {
  let resolveQueue: Array<() => void> = [];

  const throttled = throttle(
    async (...args: any[]) => {
      await func(...args);
      // Resolve all stored promises
      resolveQueue.forEach((resolve) => resolve());
      resolveQueue = [];
    },
    wait,
    options,
  );

  return (...args: any[]) =>
    new Promise<void>((resolve) => {
      resolveQueue.push(resolve);
      throttled(...args);
    });
}

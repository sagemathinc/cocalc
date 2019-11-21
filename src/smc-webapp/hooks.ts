import * as React from "react";
import { debounce, Cancelable, DebounceSettings } from "lodash";

type CancelableHOF = <T extends (...args: any[]) => any>(
  func: T,
  ...rest
) => T & Cancelable;

type Tail<T extends any[]> = ((...args: T) => any) extends (
  _: any,
  ...tail: infer Rest
) => any
  ? Rest
  : [];

/**
 * When a callback is deferred (eg. with debounce) it may
 * try to run when the component is no longer rendered
 *
 * useAsyncCallback automatically runs a clean up function
 * like React.useEffect
 */
function useAsyncCallback<
  H extends CancelableHOF,
  F extends (...args: any[]) => any
>(hof: H, callback: F, ...tail: Tail<Parameters<H>>): typeof wrapped {
  const wrapped = React.useCallback(hof(callback, ...tail), [...tail]);

  React.useEffect(() => {
    return wrapped.cancel;
  }, [wrapped]);

  return wrapped;
}

export const useDebounce = <T extends (...args) => any>(
  cb: T,
  wait?: number,
  options?: DebounceSettings
): T & Cancelable => {
  return useAsyncCallback(debounce, cb, wait, options);
};

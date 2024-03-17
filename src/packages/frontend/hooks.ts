/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DebounceSettings, DebouncedFunc, debounce } from "lodash";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

type CancelableHOF = <T extends (...args: any[]) => any>(
  func: T,
  ...rest
) => DebouncedFunc<T>;

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
 * useCallbackWith automatically runs a clean up function
 * with React.useEffect
 */
// TODO: Allow an option to flush instead of cancel
function useCallbackWith<
  H extends CancelableHOF,
  F extends (...args: any[]) => any
>(hof: H, callback: F, ...tail: Tail<Parameters<H>>): typeof wrapped {
  const wrapped = useCallback(hof(callback, ...tail), [...tail]);

  useEffect(() => {
    return wrapped.cancel;
  }, [wrapped]);

  return wrapped;
}

/**
 * Debounces `cb` dropping the last update *if* the component
 * is no longer rendered. If you need to keep the last update,
 * use lodash.debounce directly.
 *
 * @param cb The function to debounce
 * @param wait The number of milliseconds to delay
 * @param options Options passed to lodash.debounce
 */
export const useDebounce = <T extends (...args) => any>(
  cb: T,
  wait?: number,
  options?: DebounceSettings
): DebouncedFunc<T> => {
  return useCallbackWith(debounce, cb, wait, options);
};

/** Observe height and width of the given HTML element, by it's reference */
export function useMeasureDimensions(
  ref: React.RefObject<HTMLElement>,
  { debounce_ms = 50 }: { debounce_ms?: number } = {}
) {
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);

  // observe the height and width of ref
  // that's why we need a layout effect
  useLayoutEffect(() => {
    if (ref.current == null) return;
    const observer = new ResizeObserver(
      debounce(
        () => {
          if (ref.current == null) return;
          setWidth(ref.current.clientWidth);
          setHeight(ref.current.clientHeight);
        },
        debounce_ms,
        { trailing: true, leading: false }
      )
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref.current]);

  return { height, width };
}

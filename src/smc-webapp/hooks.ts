/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
 * useCallbackWith automatically runs a clean up function
 * with React.useEffect
 */
// TODO: Allow an option to flush instead of cancel
function useCallbackWith<
  H extends CancelableHOF,
  F extends (...args: any[]) => any
>(hof: H, callback: F, ...tail: Tail<Parameters<H>>): typeof wrapped {
  const wrapped = React.useCallback(hof(callback, ...tail), [...tail]);

  React.useEffect(() => {
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
): T & Cancelable => {
  return useCallbackWith(debounce, cb, wait, options);
};

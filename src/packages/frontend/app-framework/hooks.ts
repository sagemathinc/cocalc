/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Gather together and export some common hooks for convenience. */

declare const window: any;

import { delay } from "awaiting";
export {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useLayoutEffect,
} from "react";
import { useAsyncEffect } from "use-async-effect";
export { useAsyncEffect };
export { useSelector } from "react-redux";
import { useRef, useEffect, useState } from "react";
export { useFrameContext } from "../frame-editors/frame-tree/frame-context";

import useIsMountedRef from "./is-mounted-hook";
export { useIsMountedRef };

export function useForceUpdate() {
  const [state, set_state] = useState<boolean>(true);
  return () => {
    set_state(!state);
  };
}

/* Delay rendering for a certain number of milliseconds.
  Use it like this at the top of your component to make it
  so nothing gets rendered until after the delay:

  const render = useDelayedRender(props.index);
  // ...
  // any other hooks
  // ...
  if (!render) {
    return <></>;
  }

*/

export function useDelayedRender(delay_ms: number) {
  const [render, set_render] = useState<boolean>(delay_ms <= 0);
  useAsyncEffect(async (is_mounted) => {
    if (delay_ms == 0) return;
    await delay(delay_ms);
    if (!is_mounted()) return;
    set_render(true);
  }, []);
  return render;
}

function getWindowDimensions() {
  const { innerWidth: width, innerHeight: height } = window;
  return { width, height };
}

export function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = useState(
    getWindowDimensions()
  );

  useEffect(() => {
    function handleResize() {
      setWindowDimensions(getWindowDimensions());
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return windowDimensions;
}

// if val changes, it updates the reference to the previous value.
// With that, from the component itself, you always have access to the previous value.
// Watch out, initially it's certainly undefined!
export function usePrevious<T>(val: T): T | null {
  const prevRef = useRef<T | null>(null);

  useEffect(() => {
    prevRef.current = val;
  }, [val]);

  return prevRef.current;
}

// This is a simple boolean toggle.
export function useToggle(init: boolean = false): [boolean, () => void] {
  const [val, set_val] = useState(init);
  const toggle = () => set_val(!val);
  return [val, toggle];
}

// Use this to count up or down. e.g.
// const {val: counter_value, inc: inc_counter} = useCounter()
export function useCounter(init: number = 0) {
  const [val, set_val] = useState(init);
  const inc = () => set_val(val + 1);
  const dec = () => set_val(val - 1);
  return { val, inc, dec };
}

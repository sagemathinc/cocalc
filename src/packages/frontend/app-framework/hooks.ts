/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Gather together and export some common hooks for convenience. */

declare const window: any;

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { useAsyncEffect } from "use-async-effect";

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import useCounter from "./counter-hook";
import useDelayedRender from "./delayed-render-hook";
import useIsMountedRef from "./is-mounted-hook";
import useToggle from "./toggle-hook";

export {
  useAsyncEffect,
  useCallback,
  useCounter,
  useDelayedRender,
  useEffect,
  useFrameContext,
  useIsMountedRef,
  useLayoutEffect,
  useMemo,
  useRef,
  useSelector,
  useState,
  useToggle,
};

export function useForceUpdate() {
  const counterRef = useRef<any>(0);
  const [, setCounter] = useState<number>(0);
  return () => {
    setCounter((counterRef.current += 1));
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

function getWindowDimensions() {
  const { innerWidth: width, innerHeight: height } = window;
  return { width, height };
}

export function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = useState(
    getWindowDimensions(),
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

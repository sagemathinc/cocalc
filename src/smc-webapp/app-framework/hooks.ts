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

// A *ref* that is true after component mounts, then false once
// the component unmounts.  This obviously must be a ref since
// it makes no sense for unmounting or mounting to trigger
// a render cycle!.  I made this up myself, but it does turn out
// to be identical to an npm package to do this:
//    https://github.com/jmlweb/isMounted/blob/master/index.js

export function useIsMountedRef() {
  const is_mounted_ref = useRef<boolean>(false);
  useEffect(() => {
    is_mounted_ref.current = true;
    return () => {
      is_mounted_ref.current = false;
    };
  }, []);
  return is_mounted_ref;
}

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

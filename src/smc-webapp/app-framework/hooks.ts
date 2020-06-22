/* Gather together and export some common hooks for convenience. */

export { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
export { useAsyncEffect } from "use-async-effect";
export { useSelector } from "react-redux";

import { useRef, useEffect, useState } from "react";

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

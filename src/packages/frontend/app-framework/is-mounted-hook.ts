import { useEffect, useRef } from "react";

// A *ref* that is true after component mounts, then false once
// the component unmounts.  This obviously must be a ref since
// it makes no sense for unmounting or mounting to trigger
// a render cycle!.  I made this up myself, but it does turn out
// to be identical to an npm package to do this:
//    https://github.com/jmlweb/isMounted/blob/master/index.js

export default function useIsMountedRef() {
  const is_mounted_ref = useRef<boolean>(false);
  useEffect(() => {
    is_mounted_ref.current = true;
    return () => {
      is_mounted_ref.current = false;
    };
  }, []);
  return is_mounted_ref;
}

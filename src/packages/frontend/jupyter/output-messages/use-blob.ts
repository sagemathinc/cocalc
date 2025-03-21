import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { useEffect, useState } from "react";
import LRU from "lru-cache";

const cache = new LRU<string, string>({
  max: 100,
  dispose: (url) => {
    URL.revokeObjectURL(url);
  },
});

export default function useBlob({
  sha1,
  actions,
  type,
  setError,
}: {
  sha1: string;
  actions?;
  // the mime type
  type: string;
  setError: (string) => void;
}) {
  const isMounted = useIsMountedRef();
  const [src, setSrc] = useState<string | undefined>(cache.get(sha1));
  useEffect(() => {
    if (cache.has(sha1)) {
      setSrc(cache.get(sha1));
      return;
    }
    if (actions?.asyncBlobStore == null) {
      setError("Not available");
      return;
    }
    (async () => {
      let buf;
      try {
        buf = await actions.asyncBlobStore.get(sha1, { timeout: 5000 });
      } catch (err) {
        setError(`${err}`);
        return;
      }
      if (buf == null) {
        setError("Not available");
        return;
      }
      const blob = new Blob([buf], { type });
      const src = URL.createObjectURL(blob);
      cache.set(sha1, src);
      if (isMounted.current && !actions.is_closed()) {
        setSrc(src);
      }
    })();
  }, [sha1]);

  return src;
}

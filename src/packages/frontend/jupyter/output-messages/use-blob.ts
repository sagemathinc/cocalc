import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { useEffect, useState } from "react";
import LRU from "lru-cache";

// max number of recent blob url's to save - older ones will
// silently be removed and data has to be re-downloaded from server.
const MAX_BLOB_URLS = 200;

// wait at most this long to get blob from backend.
const BLOB_WAIT_TIMEOUT = 30000;

const cache = new LRU<string, string>({
  max: MAX_BLOB_URLS,
  dispose: (url) => {
    URL.revokeObjectURL(url);
  },
});

async function blobToUrl({ actions, sha1, type, leaveAsString }) {
  if (cache.has(sha1)) {
    return cache.get(sha1)!;
  }
  const buf = await actions.asyncBlobStore.get(sha1, {
    timeout: BLOB_WAIT_TIMEOUT,
  });
  if (buf == null) {
    throw Error("Not available");
  }
  let src;
  if (leaveAsString != null) {
    const t = new TextDecoder("utf8");
    const str = t.decode(buf);
    if (leaveAsString(str)) {
      src = str;
      cache.set(sha1, src);
      return src;
    }
  }
  const blob = new Blob([buf], { type });
  src = URL.createObjectURL(blob);
  cache.set(sha1, src);
  return src;
}

export default function useBlob({
  sha1,
  actions,
  type,
  setError,
  leaveAsString,
}: {
  sha1: string;
  actions?;
  // the mime type
  type: string;
  setError: (string) => void;
  leaveAsString?: (buf) => boolean;
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
      try {
        const src = await blobToUrl({ actions, sha1, type, leaveAsString });
        if (!isMounted.current) {
          return;
        }
        setSrc(src);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [sha1]);

  return src;
}

import useIsMountedRef from "@cocalc/frontend/app-framework/is-mounted-hook";
import { useEffect, useState } from "react";
import LRU from "lru-cache";

const MAX_BLOB_URLS = 200;

const cache = new LRU<string, string>({
  max: MAX_BLOB_URLS,
  dispose: (url) => {
    URL.revokeObjectURL(url);
  },
});

export async function blobToUrl({ actions, sha1, type }) {
  if (cache.has(sha1)) {
    return cache.get(sha1)!;
  }
  const buf = await actions.asyncBlobStore.get(sha1, { timeout: 5000 });
  if (buf == null) {
    throw Error("Not available");
  }
  const blob = new Blob([buf], { type });
  const src = URL.createObjectURL(blob);
  cache.set(sha1, src);
  return src;
}

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
      try {
        const s = await blobToUrl({ actions, sha1, type });
        if (!isMounted.current) {
          return;
        }
        setSrc(s);
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, [sha1]);

  return src;
}

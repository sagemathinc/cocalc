/*
Hook that provides all files in a directory via a Conat FilesystemClient.
This automatically updates when files change.

TESTS: See packages/test/project/listing/

*/

import useAsyncEffect from "use-async-effect";
import { useRef, useState } from "react";
import { throttle } from "lodash";
import { type Files } from "@cocalc/conat/files/listing";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { type ConatError } from "@cocalc/conat/core/client";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import LRU from "lru-cache";
import type { JSONValue } from "@cocalc/util/types";
import { dirname, join } from "path";

export { Files };

const DEFAULT_THROTTLE_FILE_UPDATE = 500;

// max number of subdirs to cache right after computing the listing for a dir
// This makes it so clicking on a subdir for a listing is MUCH faster.
const MAX_SUBDIR_CACHE = 10;

const CACHE_SIZE = 150;

const cache = new LRU<string, Files>({ max: CACHE_SIZE });

export function getFiles({
  cacheId,
  path,
}: {
  cacheId?: JSONValue;
  path: string;
}): Files | null {
  if (cacheId == null) {
    return null;
  }
  return cache.get(key(cacheId, path)) ?? null;
}

export default function useFiles({
  fs,
  path,
  throttleUpdate = DEFAULT_THROTTLE_FILE_UPDATE,
  cacheId,
}: {
  // fs = undefined is supported and just waits until you provide a fs that is defined
  fs?: FilesystemClient | null;
  path: string;
  throttleUpdate?: number;
  // cacheId -- if given, save most recently loaded Files for a path in an in-memory LRU cache.
  // An example cacheId could be {project_id, compute_server_id}.
  // This is used to speed up the first load, and can also be fetched synchronously.
  cacheId?: JSONValue;
}): { files: Files | null; error: null | ConatError; refresh: () => void } {
  const [files, setFiles] = useState<Files | null>(getFiles({ cacheId, path }));
  const [error, setError] = useState<any>(null);
  const { val: counter, inc: refresh } = useCounter();
  const listingRef = useRef<any>(null);

  useAsyncEffect(
    async () => {
      if (fs == null) {
        setError(null);
        setFiles(null);
        return;
      }
      let listing;
      try {
        setFiles(getFiles({ cacheId, path }));
        listing = await fs.listing(path);
        listingRef.current = listing;
        setError(null);
      } catch (err) {
        setError(err);
        setFiles(null);
        return;
      }
      if (cacheId != null) {
        cache.set(key(cacheId, path), listing.files);
        if (listing.files != null) {
          cacheNeighbors({ fs, cacheId, path, files: listing.files });
        }
      }
      const update = () => {
        setFiles({ ...listing.files });
      };
      update();

      listing.on(
        "change",
        throttle(update, throttleUpdate, { leading: true, trailing: true }),
      );
    },
    () => {
      listingRef.current?.close();
      delete listingRef.current;
    },
    [fs, path, counter],
  );

  return { files, error, refresh };
}

function key(cacheId: JSONValue, path: string) {
  return JSON.stringify({ cacheId, path });
}

// anything in failed we don't try to update -- this is
// purely a convenience so no need to worry.
const failed = new Set<string>();

async function ensureCached({
  cacheId,
  fs,
  path,
}: {
  fs: FilesystemClient;
  cacheId: JSONValue;
  path: string;
}) {
  const k = key(cacheId, path);
  if (cache.has(k) || failed.has(k)) {
    return;
  }
  try {
    const { files } = await fs.listing(path);
    if (files) {
      cache.set(k, files);
    } else {
      failed.add(k);
    }
  } catch {
    failed.add(k);
  }
}

async function cacheNeighbors({
  fs,
  cacheId,
  path,
  files,
}: {
  fs: FilesystemClient;
  cacheId: JSONValue;
  path: string;
  files: Files;
}) {
  let v: string[] = [];
  for (const dir in files) {
    if (!dir.startsWith(".") && files[dir].isdir) {
      const full = join(path, dir);
      const k = key(cacheId, full);
      if (!cache.has(k) && !failed.has(k)) {
        v.push(full);
      }
    }
  }
  if (path) {
    let parent = dirname(path);
    if (parent == ".") {
      parent = "";
    }
    const k = key(cacheId, parent);
    if (!cache.has(k) && !failed.has(k)) {
      v.push(parent);
    }
  }
  const f = async (path: string) => {
    await ensureCached({ cacheId, fs, path });
  };
  v.sort();
  // grab up to MAX_SUBDIR_CACHE missing listings in parallel
  v = v.slice(0, MAX_SUBDIR_CACHE);
  await Promise.all(v.map(f));
}

/*
A directory listing hook.
*/

import { useMemo, useState } from "react";
import { DirectoryListingEntry } from "@cocalc/util/types";
import useAsyncEffect from "use-async-effect";
import { throttle } from "lodash";
import { field_cmp } from "@cocalc/util/misc";
import { type Files } from "@cocalc/conat/files/listing";
import { type FilesystemClient } from "@cocalc/conat/files/fs";

const DEFAULT_THROTTLE_FILE_UPDATE = 500;

type SortField = "name" | "mtime" | "size";
type SortDirection = "inc" | "dec";

export default function useListing({
  fs,
  path,
  sortField = "name",
  sortDirection = "inc",
}: {
  fs: FilesystemClient;
  path: string;
  sortField?: SortField;
  sortDirection?: SortDirection;
}): {
  listing: null | DirectoryListingEntry[];
  error: null | Error;
  refresh: () => void;
} {
  const { files, error, refresh } = useFiles({ fs, path });

  const listing = useMemo<null | DirectoryListingEntry[]>(() => {
    if (files == null) {
      return null;
    }
    const v: DirectoryListingEntry[] = [];
    for (const name in files) {
      v.push({ name, ...files[name] });
    }
    v.sort(field_cmp("name"));
    if (sortDirection == "dec") {
      v.reverse();
    }
    return v;
  }, [sortField, sortDirection, files]);

  return { listing, error, refresh };
}

export function useFiles({
  fs,
  path,
  throttleUpdate = DEFAULT_THROTTLE_FILE_UPDATE,
}: {
  fs: FilesystemClient;
  path: string;
  throttleUpdate?: number;
}): { files: Files | null; error: null | Error; refresh: () => void } {
  const [files, setFiles] = useState<Files | null>(null);
  const [error, setError] = useState<any>(null);
  const [counter, setCounter] = useState<number>(0);

  useAsyncEffect(async () => {
    let listing;
    try {
      listing = await fs.listing(path);
      setError(null);
    } catch (err) {
      setError(err);
      setFiles(null);
      return;
    }

    const update = () => {
      setFiles({ ...listing.files });
    };
    update();

    listing.on(
      "change",
      throttle(update, throttleUpdate, { leading: true, trailing: true }),
    );

    return () => {
      listing.close();
    };
  }, [fs, path, counter]);

  return { files, error, refresh: () => setCounter(counter + 1) };
}

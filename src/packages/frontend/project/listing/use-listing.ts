/*
A directory listing hook.

TESTS: See packages/test/project/listing/
*/

import { useMemo } from "react";
import { DirectoryListingEntry } from "@cocalc/util/types";
import { field_cmp } from "@cocalc/util/misc";
import useFiles from "./use-files";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { type ConatError } from "@cocalc/conat/core/client";

type SortField = "name" | "mtime" | "size";
type SortDirection = "inc" | "dec";

export default function useListing({
  fs,
  path,
  sortField = "name",
  sortDirection = "inc",
  throttleUpdate,
}: {
  fs: FilesystemClient;
  path: string;
  sortField?: SortField;
  sortDirection?: SortDirection;
  throttleUpdate?: number;
}): {
  listing: null | DirectoryListingEntry[];
  error: null | ConatError;
  refresh: () => void;
} {
  const { files, error, refresh } = useFiles({ fs, path, throttleUpdate });

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

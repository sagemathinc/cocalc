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

export type SortField = "name" | "mtime" | "size" | "type";
export type SortDirection = "asc" | "desc";

export default function useListing({
  fs,
  path,
  sortField = "name",
  sortDirection = "asc",
  throttleUpdate,
}: {
  // fs = undefined is supported and just waits until you provide a fs that is defined
  fs?: FilesystemClient | null;
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
    if (
      sortField != "name" &&
      sortField != "mtime" &&
      sortField != "size" &&
      sortField != "type"
    ) {
      console.warn(`invalid sort field: '${sortField}'`);
    }
    v.sort(field_cmp(sortField));
    if (sortDirection == "desc") {
      v.reverse();
    } else if (sortDirection == "asc") {
    } else {
      console.warn(`invalid sort direction: '${sortDirection}'`);
    }
    return v;
  }, [sortField, sortDirection, files]);

  return { listing, error, refresh };
}

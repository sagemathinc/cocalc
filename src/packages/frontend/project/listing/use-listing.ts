/*
A directory listing hook.

TESTS: See packages/test/project/listing/
*/

import { useMemo } from "react";
import { type DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";
import { field_cmp } from "@cocalc/util/misc";
import useFiles from "./use-files";
import { type FilesystemClient } from "@cocalc/conat/files/fs";
import { type ConatError } from "@cocalc/conat/core/client";
import type { JSONValue } from "@cocalc/util/types";
import { getFiles, type Files } from "./use-files";
import { computeFileMasks } from "@cocalc/frontend/project/explorer/compute-file-masks";

export type SortField = "name" | "mtime" | "size" | "type";
export type SortDirection = "asc" | "desc";

export function getListing({
  path,
  cacheId,
  sortField,
  sortDirection,
}: {
  path;
  string;
  cacheId?: JSONValue;
  sortField?: SortField;
  sortDirection?: SortDirection;
}): null | DirectoryListingEntry[] {
  const files = getFiles({ cacheId, path });
  return filesToListing({ files, sortField, sortDirection });
}

export default function useListing({
  fs,
  path,
  sortField = "name",
  sortDirection = "asc",
  throttleUpdate,
  cacheId,
  mask,
}: {
  // fs = undefined is supported and just waits until you provide a fs that is defined
  fs?: FilesystemClient | null;
  path: string;
  sortField?: SortField;
  sortDirection?: SortDirection;
  throttleUpdate?: number;
  cacheId?: JSONValue;
  mask?: boolean;
}): {
  listing: null | DirectoryListingEntry[];
  error: null | ConatError;
  refresh: () => void;
} {
  const { files, error, refresh } = useFiles({
    fs,
    path,
    throttleUpdate,
    cacheId,
  });

  const listing = useMemo<null | DirectoryListingEntry[]>(() => {
    return filesToListing({ files, sortField, sortDirection, mask });
  }, [sortField, sortDirection, files]);

  return { listing, error, refresh };
}

function filesToListing({
  files,
  sortField = "name",
  sortDirection = "asc",
  mask,
}: {
  files?: Files | null;
  sortField?: SortField;
  sortDirection?: SortDirection;
  mask?: boolean;
}): null | DirectoryListingEntry[] {
  if (files == null) {
    return null;
  }
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
  if (mask) {
    // note -- this masking is as much time as everything above
    computeFileMasks(v);
  }
  return v;
}

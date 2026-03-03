/*
 *  This file is part of CoCalc: Copyright © 2023-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Compute the processed file listing for the flyout's files panel.
 *
 * Filters, sorts, and annotates the raw directory listing based on the
 * current search, hidden-file toggle, type filter, sort column, starred
 * files, and open files.  Returns the same shape as the old inline
 * `useMemo` in files.tsx.
 */

import { List, Map } from "immutable";
import { fromPairs } from "lodash";

import {
  TypedMap,
  useMemo,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { compute_file_masks } from "@cocalc/frontend/project/explorer/compute-file-masks";
import {
  DirectoryListing,
  DirectoryListingEntry,
  FileMap,
} from "@cocalc/frontend/project/explorer/types";
import { sortedTypeFilterOptions } from "@cocalc/frontend/project/explorer/file-listing/utils";
import { mutate_data_to_compute_public_files } from "@cocalc/frontend/project_store";
import {
  copy_without,
  filename_extension,
  path_to_file,
  search_match,
  search_split,
} from "@cocalc/util/misc";

import type { ActiveFileSort } from "./files";

const EMPTY_LISTING: [DirectoryListing, FileMap, null, boolean] = [
  [],
  {},
  null,
  true,
];

/** Stripped public paths from the project store. */
function useStrippedPublicPaths(project_id: string) {
  const public_paths = useTypedRedux({ project_id }, "public_paths");
  return useMemo(() => {
    if (public_paths == null) return List();
    return public_paths
      .valueSeq()
      .map((public_path: any) =>
        copy_without(public_path.toJS(), ["id", "project_id"]),
      );
  }, [public_paths]);
}

interface UseComputedFilesArgs {
  project_id: string;
  current_path: string;
  activePath: string | undefined;
  directoryListings: Map<string, TypedMap<DirectoryListing> | null> | null;
  activeFileSort: ActiveFileSort;
  file_search: string;
  hidden: boolean | undefined;
  maskFiles: boolean | undefined;
  typeFilter: string | null;
  openFiles: any; // immutable.List<string>
  starred: string[];
}

/**
 * Compute the sorted, filtered file listing for the flyout.
 *
 * Returns `[directoryFiles, fileMap, activeFile, isEmpty]`.
 */
export function useComputedFiles({
  project_id,
  current_path,
  activePath,
  directoryListings,
  activeFileSort,
  file_search,
  hidden,
  maskFiles,
  typeFilter,
  openFiles,
  starred,
}: UseComputedFilesArgs): [
  DirectoryListing,
  FileMap,
  DirectoryListingEntry | null,
  boolean,
] {
  const strippedPublicPaths = useStrippedPublicPaths(project_id);

  return useMemo((): [
    DirectoryListing,
    FileMap,
    DirectoryListingEntry | null,
    boolean,
  ] => {
    if (directoryListings == null) return EMPTY_LISTING;
    const filesStore = directoryListings.get(current_path);
    if (filesStore == null) return EMPTY_LISTING;

    // TODO this is an error, process it
    if (typeof filesStore === "string") return EMPTY_LISTING;

    const files: DirectoryListing | null = filesStore.toJS?.();
    if (files == null) return EMPTY_LISTING;
    let activeFile: DirectoryListingEntry | null = null;
    if (maskFiles) {
      compute_file_masks(files);
    }
    const searchWords = search_split(file_search.trim().toLowerCase());

    const procFiles = files
      .filter((file: DirectoryListingEntry) => {
        file.name ??= ""; // sanitization

        if (file_search === "") return true;
        const fName = file.name.toLowerCase();
        return (
          search_match(fName, searchWords) ||
          ((file.isdir ?? false) && search_match(`${fName}/`, searchWords))
        );
      })
      .filter(
        (file: DirectoryListingEntry) => hidden || !file.name.startsWith("."),
      )
      .filter((file: DirectoryListingEntry) => {
        if (typeFilter == null) return true;
        if (typeFilter === "folder") return !!file.isdir;
        if (file.isdir) return false;
        const ext = filename_extension(file.name)?.toLowerCase() || "(none)";
        return ext === typeFilter;
      });

    // this shares the logic with what's in project_store.js
    mutate_data_to_compute_public_files(
      {
        listing: procFiles,
        public: {},
      },
      strippedPublicPaths,
      current_path,
    );

    procFiles.sort((a, b) => {
      // This replicates what project_store is doing
      const col = activeFileSort.get("column_name");
      switch (col) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return (a.size ?? 0) - (b.size ?? 0);
        case "time":
          return (b.mtime ?? 0) - (a.mtime ?? 0);
        case "type": {
          const aDir = a.isdir ?? false;
          const bDir = b.isdir ?? false;
          if (aDir && !bDir) return -1;
          if (!aDir && bDir) return 1;
          const aExt = a.name.split(".").pop() ?? "";
          const bExt = b.name.split(".").pop() ?? "";
          return aExt.localeCompare(bExt);
        }
        case "starred": {
          const pathA = path_to_file(current_path, a.name);
          const pathB = path_to_file(current_path, b.name);
          const starPathA = a.isdir ? `${pathA}/` : pathA;
          const starPathB = b.isdir ? `${pathB}/` : pathB;
          const starredA = starred.includes(starPathA);
          const starredB = starred.includes(starPathB);

          if (starredA && !starredB) {
            return -1;
          } else if (!starredA && starredB) {
            return 1;
          } else {
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
          }
        }
        case "public": {
          const aPublic = !!a.is_public;
          const bPublic = !!b.is_public;
          if (aPublic && !bPublic) return -1;
          if (!aPublic && bPublic) return 1;
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        }
        default:
          return 0;
      }
    });

    for (const file of procFiles) {
      const fullPath = path_to_file(current_path, file.name);
      if (openFiles.some((path) => path == fullPath)) {
        file.isopen = true;
      }
      if (activePath === fullPath) {
        file.isactive = true;
        activeFile = file;
      }
    }

    if (activeFileSort.get("is_descending")) {
      procFiles.reverse(); // in-place op
    }

    const isEmpty = procFiles.length === 0;

    // the ".." dir does not change the isEmpty state
    // hide ".." if there is a search -- https://github.com/sagemathinc/cocalc/issues/6877
    if (file_search === "" && current_path != "") {
      procFiles.unshift({
        name: "..",
        isdir: true,
      });
    }

    // map each filename to its entry in the directory listing
    const fileMap = fromPairs(procFiles.map((file) => [file.name, file]));

    return [procFiles, fileMap, activeFile, isEmpty];
  }, [
    directoryListings,
    activeFileSort,
    hidden,
    file_search,
    openFiles,
    current_path,
    strippedPublicPaths,
    maskFiles,
    typeFilter,
    activePath,
    starred,
  ]);
}

/**
 * Compute available type filter options from the unfiltered listing.
 */
export function useTypeFilterOptions(
  directoryListings: Map<string, TypedMap<DirectoryListing> | null> | null,
  current_path: string,
): string[] {
  return useMemo(() => {
    if (directoryListings == null) return [];
    const filesStore = directoryListings.get(current_path);
    if (filesStore == null || typeof filesStore === "string") return [];
    const files: DirectoryListing | null = filesStore.toJS?.();
    if (files == null) return [];

    const extensions = new Set<string>();
    for (const f of files) {
      if (f.isdir) {
        extensions.add("folder");
      } else {
        const ext = filename_extension(f.name ?? "")?.toLowerCase() || "(none)";
        extensions.add(ext);
      }
    }
    return sortedTypeFilterOptions(extensions);
  }, [directoryListings, current_path]);
}

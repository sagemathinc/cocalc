/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// NOTE(hsy): I don't know if these two types are the same, maybe they should be merged.

export interface ListingItem {
  name: string;
  isdir: boolean;
  isopen?: boolean;
  mtime?: number;
  size?: number; // bytes
}

// NOTE: there is also @cocalc/util/types/directory-listing::DirectoryListingEntry
// but ATM the relation ship to this one is unclear. Don't mix them up!
// This type here is used in the frontend, e.g. in Explorer and Flyout Files.
export interface DirectoryListingEntry {
  display_name?: string; // unclear, if this even exists
  name: string;
  size?: number;
  mtime?: number;
  isdir?: boolean;
  mask?: boolean;
  isopen?: boolean;
}

export type DirectoryListing = DirectoryListingEntry[];

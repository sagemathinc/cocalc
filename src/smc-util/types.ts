/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Misc types that are used in frontends, backends, etc. */

export interface DirectoryListingEntry {
  name: string;
  display_name?: string; // this appears in project_store
  mask?: boolean; // appears in project_store
  isdir?: boolean;
  issymlink?: boolean;
  link_target?: string; // set if issymlink is true and we're able to determine the target of the link
  size?: number; // bytes for file, number of entries for directory (*including* . and ..).
  mtime?: number;
  error?: string;
}

export interface DirectoryListing {
  files?: DirectoryListingEntry[];
  git_dir?: string;
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Misc types that are used in frontends, backends, etc. */

export interface DirectoryListingEntry {
  name: string;
  isdir?: boolean;
  issymlink?: boolean;
  link_target?: string; // set if issymlink is true and we're able to determine the target of the link
  size?: number; // bytes for file, number of entries for directory (*including* . and ..).
  mtime?: number;
  error?: string;
}

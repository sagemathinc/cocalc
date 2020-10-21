/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export interface ListingItem {
  name: string;
  isdir: boolean;
}

export interface DirectoryListingEntry {
  name: string;
  size: number;
  mtime: number;
  isdir?: boolean;
}

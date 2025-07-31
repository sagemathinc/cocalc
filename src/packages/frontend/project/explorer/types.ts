/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { DirectoryListingEntry as DirectoryListingEntry0 } from "@cocalc/util/types";

// fill in extra info used in the frontend, mainly for the UI
export interface DirectoryListingEntry extends DirectoryListingEntry0 {
  // whether or not to mask this file in the UI
  mask?: boolean;
}

export type DirectoryListing = DirectoryListingEntry[];

export type FileMap = {
  [path: string]: DirectoryListingEntry;
};

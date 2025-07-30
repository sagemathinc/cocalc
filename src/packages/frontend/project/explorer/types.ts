/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { DirectoryListingEntry as DirectoryListingEntry0 } from "@cocalc/util/types";

// fill in extra info used in the frontend, mainly for the UI
export interface DirectoryListingEntry extends DirectoryListingEntry0 {
  // whether or not to mask this file in the UI
  mask?: boolean;

  // This is used in flyout panels.  TODO: Mutating listings based on status info
  // like this that randomly changes (unlik mask above) will lead to subtle state bugs or requiring
  // inefficient frequent rerenders.  Instead one should make a separate
  // Set of the paths of open files and active files and use that in the UI.  I'm not fixing
  // this now since it is only used in the flyout panels and not the main explorer.
  isOpen?: boolean;
  isActive?: boolean;
}

export type DirectoryListing = DirectoryListingEntry[];

export type FileMap = {
  [path: string]: DirectoryListingEntry;
};

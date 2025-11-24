/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// this is tied to the back-end setup of cocalc.com and only used if
// the "/customize" endpoint does not send a suitable "software" field.
// check frontend/customize.tsx for more details.

//import { without } from "lodash";
import * as schema from "./db-schema";

// WARNING! Do not remove this from the public api.  **It is used by kucalc
// in the (closed source) manage-actions Kubernetes backend.**
export const FALLBACK_COMPUTE_IMAGE = schema.FALLBACK_COMPUTE_IMAGE;

const DEFAULT_COMPUTE_IMAGE = schema.DEFAULT_COMPUTE_IMAGE;

// this array defines their ordering
const GROUPS = [
  "Main",
  "Ubuntu 24.04",
  "Ubuntu 22.04",
  "Ubuntu 20.04",
  "Ubuntu 18.04", // empty
  "Ubuntu 16.04", // empty
] as const;

type Group = (typeof GROUPS)[number];

// names of old images, that won't trigger the "upgrade banner", pointing to the most recent end-of-life image of that series
export const DISMISS_IMG_1804 = "ubuntu1804";
export const DISMISS_IMG_2004 = "ubuntu2004-eol";
export const DISMISS_IMG_2204 = "ubuntu2204-eol";
// names of old images triggering the upgrade banner to 22.04
export const UBUNTU2004_DEPRECATED = "ubuntu2004";
export const UBUNTU2004_DEV = "ubuntu2004-dev";
export const UBUNTU2204_DEV = "ubuntu2204-dev";
// new Ubuntu 24.04 image, for development
export const UBUNTU2404_DEV = "ubuntu2404-dev";
export const UBUNTU2204 = "ubuntu2204";
export const UBUNTU2204_PREVIOUS = "ubuntu2204-previous";

export interface ComputeImage {
  id: string; // the key under which it is stored in the database
  title?: string;
  short?: string; // a shorter title, show this when you also show the group
  descr?: string;
  group: string;
  order?: number;
  hidden?: boolean;
  tag?: string;
  registry?: string;
}

interface ComputeImageProd
  extends Omit<ComputeImage, "id" | "tag" | "registry"> {
  group: Group;
}

// NOTE: do not remove entries, to preserve rendering user-facing strings for older entries
//       rather, mark them as {hidden: true}
const COMPUTE_IMAGES: { [key: string]: ComputeImageProd } = {
  // "default" or "undefined" is what was used for "ubuntu1804" until summer 2020
  // 2020: DEFAULT_COMPUTE_IMAGE has been "ubuntu2004" until december 2022.
  // 2022: DEFAULT_COMPUTE_IMAGE is now "ubuntu2204" and "ubuntu2004" became EOL.
  [DEFAULT_COMPUTE_IMAGE]: {
    order: 0,
    title: "Ubuntu 24.04 (Default)",
    short: "Ubuntu 24.04 (Default)",
    descr:
      "Ubuntu 24.04-based software stack, regularly updated, newest software",
    group: "Main",
  },
  [UBUNTU2204]: {
    title: "Ubuntu 22.04 (until June 2025)",
    short: "Ubuntu 22.04 (until June 2025)",
    descr:
      "Ubuntu 22.04-based software stack, superseded by 24.04 in June 2025",
    group: "Main",
  },
  [DISMISS_IMG_2204]: {
    order: 1,
    title: "Ubuntu 22.04 (EndOfLife)",
    short: "Ubuntu 22.04 (EndOfLife)",
    descr: "Reached end of life in June 2025",
    group: "Main",
  },
  [UBUNTU2404_DEV]: {
    title: "Ubuntu 24.04 (Testing)",
    short: "Ubuntu 24.04 (Testing)",
    descr: "Upcoming Ubuntu 24.04 based software stack",
    group: "Ubuntu 24.04",
  },
  [UBUNTU2204_DEV]: {
    title: "Ubuntu 22.04 (Testing)",
    short: "Ubuntu 22.04 (Testing)",
    descr: "Upcoming Ubuntu 22.04 based software stack",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  default: {
    order: 1,
    title: "Ubuntu 18.04 (EndOfLife)",
    short: "Ubuntu 18.04 (EndOfLife)",
    descr: "Reached end of life in August 2020",
    group: "Main",
    hidden: true,
  },
  [DISMISS_IMG_1804]: {
    // a synonym of "default", but with a specific functionality!
    // we use it as a marker: if a "default" project (before the 20.04 upgrade) is set to stay at 18.04, this image is selected.
    order: 2,
    title: "Ubuntu 18.04 (EndOfLife)",
    short: "Ubuntu 18.04 (EndOfLife)",
    descr: "Reached end of life in August 2020",
    group: "Main",
    hidden: true,
  },
  [DISMISS_IMG_2004]: {
    order: 1,
    title: "Ubuntu 20.04 (EndOfLife)",
    short: "Ubuntu 20.04 (EndOfLife)",
    descr: "Reached end of life in May 2023",
    group: "Main",
  },
  [UBUNTU2004_DEPRECATED]: {
    order: 1,
    title: "Ubuntu 20.04 (EndOfLife)",
    short: "Ubuntu 20.04 (EndOfLife)",
    descr: "Reached end of life in May 2023",
    group: "Main",
    hidden: true, // any project that is set to "ubuntu2004" will be shown a banner → either update to ubuntu2204 or keep ubuntu2004-eol
  },
  "ubuntu2404-2025-06-26": {
    title: "Ubuntu 24.04 (2025-06-26)",
    short: "2025-06-26",
    descr: "Frozen on 2025-06-26 and no longer updated",
    group: "Ubuntu 24.04",
  },
  [UBUNTU2204_PREVIOUS]: {
    title: "Ubuntu 22.04 (Previous)",
    short: "Previous",
    descr: "Slightly behind 22.04 (Current)",
    group: "Ubuntu 22.04",
  },
  "ubuntu2004-previous": {
    title: "Ubuntu 20.04 (Previous)",
    short: "Previous",
    descr: "Slightly behind 20.04 (Current)",
    group: "Ubuntu 20.04",
    hidden: true,
  },
  "ubuntu2204-2025-04-07": {
    title: "Ubuntu 22.04 (2025-04-07)",
    short: "2025-04-07",
    descr: "Frozen on 2025-04-07 and no longer updated",
    group: "Ubuntu 22.04",
  },
  "ubuntu2204-2024-11-25": {
    title: "Ubuntu 22.04 (2024-11-25)",
    short: "2024-11-25",
    descr: "Frozen on 2024-11-25 and no longer updated",
    group: "Ubuntu 22.04",
  },
  "ubuntu2204-2024-08-01": {
    title: "Ubuntu 22.04 (2024-08-01)",
    short: "2024-08-01",
    descr: "Frozen on 2024-08-01 and no longer updated",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  "ubuntu2204-2024-05-13": {
    title: "Ubuntu 22.04 (2024-05-13)",
    short: "2024-05-13",
    descr: "Frozen on 2024-05-13 and no longer updated",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  "ubuntu2204-2024-02-07": {
    title: "Ubuntu 22.04 (2024-02-07)",
    short: "2024-02-07",
    descr: "Frozen on 2024-02-07 and no longer updated",
    group: "Ubuntu 22.04",
  },
  "ubuntu2204-2023-01-09": {
    title: "Ubuntu 22.04 (2023-01-09)",
    short: "2023-01-09",
    descr: "Frozen on 2023-01-09 and no longer updated",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  "ubuntu2204-2023-04-19": {
    title: "Ubuntu 22.04 (2023-04-19)",
    short: "2023-04-19",
    descr: "Frozen on 2023-04-19 and no longer updated",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  "ubuntu2204-2023-05-15": {
    title: "Ubuntu 22.04 (2023-05-15)",
    short: "2023-05-15",
    descr: "Frozen on 2023-05-15 and no longer updated",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  "ubuntu2204-2023-09-11": {
    title: "Ubuntu 22.04 (2023-09-11)",
    short: "2023-09-11",
    descr: "Frozen on 2023-09-11 and no longer updated",
    group: "Ubuntu 22.04",
    hidden: true,
  },
  [UBUNTU2004_DEV]: {
    title: "Ubuntu 20.04 (Testing)",
    short: "Testing",
    descr: "Upcoming software changes – could be broken!",
    group: "Ubuntu 20.04",
    hidden: true,
  },
  "ubuntu2004-2020-10-28": {
    title: "Ubuntu 20.04 (2020-10-28)",
    short: "2020-10-28",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2020-10-28 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2020-12-09": {
    title: "Ubuntu 20.04 (2020-12-09)",
    short: "2020-12-09",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2020-12-09 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2021-02-01": {
    title: "Ubuntu 20.04 (2021-02-01)",
    short: "2021-02-01",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-02-01 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2021-05-31": {
    title: "Ubuntu 20.04 (2021-05-31)",
    short: "2021-05-31",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-05-31 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2021-08-13": {
    title: "Ubuntu 20.04 (2021-08-13)",
    short: "2021-08-13",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-08-13 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2021-10-10": {
    title: "Ubuntu 20.04 (2021-10-10)",
    short: "2021-10-10",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-10-10 and no longer updated",
  },
  "ubuntu2004-2022-04-19": {
    title: "Ubuntu 20.04 (2022-04-19)",
    short: "2022-04-19",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2022-04-19 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2022-08-17": {
    title: "Ubuntu 20.04 (2022-08-17)",
    short: "2022-08-17",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2022-08-17 and no longer updated",
    hidden: true,
  },
  "ubuntu2004-2022-11-25": {
    title: "Ubuntu 20.04 (2022-11-25)",
    short: "2022-11-25",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2022-11-25 and no longer updated",
  },
  previous: {
    order: -2,
    title: "Ubuntu 18.04 (Previous)",
    short: "Previous",
    descr: "Reached end of life in August 2020",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  exp: {
    order: -1,
    title: "Ubuntu 18.04 (Experimental)",
    short: "Experimental",
    descr: "Reached end of life in August 2020",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2018-08-27": {
    title: "Ubuntu 18.04 @ 2018-08-27",
    short: "2018-08-27",
    descr: "Frozen on 2018-08-27 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2019-01-12": {
    title: "Ubuntu 18.04 @ 2019-01-12",
    short: "2019-01-12",
    descr: "Frozen on 2019-01-12 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2019-07-15": {
    title: "Ubuntu 18.04 @ 2019-07-15",
    short: "2019-07-15",
    descr: "Frozen on 2019-07-15 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2019-10-25_ro": {
    title: "Ubuntu 18.04 @ 2019-10-25",
    short: "2019-10-25",
    descr: "Frozen on 2019-10-25 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2019-12-15_ro": {
    title: "Ubuntu 18.04 @ 2019-12-15",
    short: "2019-12-15",
    descr: "Frozen on 2019-12-15 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2020-01-26_ro": {
    title: "Ubuntu 18.04 @ 2020-01-26",
    short: "2020-01-26",
    descr: "Frozen on 2020-01-26 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  "stable-2020-07-31": {
    title: "Ubuntu 18.04 @ 2020-07-31",
    short: "2020-07-31",
    descr: "Frozen on 2020-07-31 and no longer updated",
    group: "Ubuntu 18.04",
    hidden: true,
  },
  old: {
    order: 10,
    title: "Old Ubuntu 16.04",
    short: "Old software image",
    descr: "In use until Summer 2018. No longer maintained!",
    group: "Ubuntu 16.04",
    hidden: true,
  },
} as const;

export const FALLBACK_SOFTWARE_ENV = {
  default: DEFAULT_COMPUTE_IMAGE,
  groups: GROUPS, // without(GROUPS, "Ubuntu 18.04", "Ubuntu 16.04"),
  environments: COMPUTE_IMAGES,
} as const;

// this is purely fallback for the case, where the new software env code runs on-prem
// but no software is setup. it assumes projects were created with the DEFAULT_COMPUTE_IMAGE.
export const FALLBACK_ONPREM_ENV = {
  default: DEFAULT_COMPUTE_IMAGE,
  groups: ["Standard"],
  environments: {
    [DEFAULT_COMPUTE_IMAGE]: {
      title: "Standard",
      group: "Standard",
    },
  },
} as const;

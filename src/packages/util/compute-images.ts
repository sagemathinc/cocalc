/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is tied to the back-end setup of cocalc.com and only used if
// the "/customize" endpoint does not send a suitable "software" field.
// check frontend/customize.tsx for more details.

import * as schema from "./db-schema";

const DEFAULT_COMPUTE_IMAGE = schema.DEFAULT_COMPUTE_IMAGE;

// this array defines their ordering
const GROUPS = [
  "Main",
  "Ubuntu 20.04",
  "Ubuntu 18.04",
  "Ubuntu 16.04",
  "Ubuntu 22.04", // TODO: until 22.04 is stable and official, we keep it burried at the end!
] as const;

type Group = typeof GROUPS[number];

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
  // nowdays, DEFAULT_COMPUTE_IMAGE is "ubuntu2004"
  default: {
    order: 1,
    title: "Ubuntu 18.04 (Deprecated)",
    short: "Ubuntu 18.04 (Deprecated)",
    descr: "Ubuntu 18.04 reached end of life in August 2020",
    group: "Main",
    hidden: true,
  },
  ubuntu1804: {
    // a synonym of "default", but with a specific functionality!
    // we use it as a marker: if a "default" project (before the 20.04 upgrade) is set to stay at 18.04, this image is selected.
    order: 1,
    title: "Ubuntu 18.04 (EndOfLife)",
    short: "Ubuntu 18.04 (EndOfLife)",
    descr: "Ubuntu 18.04 reached end of life in August 2020",
    group: "Main",
  },
  ubuntu2004: {
    order: 0,
    title: "Ubuntu 20.04 (Default)",
    short: "Ubuntu 20.04 (Default)",
    descr: "Regular updates, well tested",
    group: "Main",
  },
  "ubuntu2004-previous": {
    title: "Ubuntu 20.04 (Previous)",
    short: "Previous",
    descr: "Slightly behind 20.04 (Default)",
    group: "Ubuntu 20.04",
  },
  "ubuntu2004-dev": {
    title: "Ubuntu 20.04 (Testing)",
    short: "Testing",
    descr: "Upcoming software changes – could be broken!",
    group: "Ubuntu 20.04",
  },
  "ubuntu2004-2020-10-28": {
    title: "Ubuntu 20.04 (2020-10-28)",
    short: "2020-10-28",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2020-10-28 and no longer updated",
  },
  "ubuntu2004-2020-12-09": {
    title: "Ubuntu 20.04 (2020-12-09)",
    short: "2020-12-09",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2020-12-09 and no longer updated",
  },
  "ubuntu2004-2021-02-01": {
    title: "Ubuntu 20.04 (2021-02-01)",
    short: "2021-02-01",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-02-01 and no longer updated",
  },
  "ubuntu2004-2021-05-31": {
    title: "Ubuntu 20.04 (2021-05-31)",
    short: "2021-05-31",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-05-31 and no longer updated",
  },
  "ubuntu2004-2021-08-13": {
    title: "Ubuntu 20.04 (2021-08-13)",
    short: "2021-08-13",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2021-08-13 and no longer updated",
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
  },
  "ubuntu2004-2022-08-17": {
    title: "Ubuntu 20.04 (2022-08-17)",
    short: "2022-08-17",
    group: "Ubuntu 20.04",
    descr: "Frozen on 2022-08-17 and no longer updated",
  },
  previous: {
    order: -2,
    title: "Ubuntu 18.04 (Previous)",
    short: "Previous",
    descr: "Ubuntu 18.04 Reached end of life in August 2020",
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
  },
  "stable-2019-01-12": {
    title: "Ubuntu 18.04 @ 2019-01-12",
    short: "2019-01-12",
    descr: "Frozen on 2019-01-12 and no longer updated",
    group: "Ubuntu 18.04",
  },
  "stable-2019-07-15": {
    title: "Ubuntu 18.04 @ 2019-07-15",
    short: "2019-07-15",
    descr: "Frozen on 2019-07-15 and no longer updated",
    group: "Ubuntu 18.04",
  },
  "stable-2019-10-25_ro": {
    title: "Ubuntu 18.04 @ 2019-10-25",
    short: "2019-10-25",
    descr: "Frozen on 2019-10-25 and no longer updated",
    group: "Ubuntu 18.04",
  },
  "stable-2019-12-15_ro": {
    title: "Ubuntu 18.04 @ 2019-12-15",
    short: "2019-12-15",
    descr: "Frozen on 2019-12-15 and no longer updated",
    group: "Ubuntu 18.04",
  },
  "stable-2020-01-26_ro": {
    title: "Ubuntu 18.04 @ 2020-01-26",
    short: "2020-01-26",
    descr: "Frozen on 2020-01-26 and no longer updated",
    group: "Ubuntu 18.04",
  },
  "stable-2020-07-31": {
    title: "Ubuntu 18.04 @ 2020-07-31",
    short: "2020-07-31",
    descr: "Frozen on 2020-07-31 and no longer updated",
    group: "Ubuntu 18.04",
  },
  old: {
    order: 10,
    title: "Old Ubuntu 16.04",
    short: "Old software image",
    descr: "In use until Summer 2018. No longer maintained!",
    group: "Ubuntu 16.04",
  },
  "ubuntu2204-dev": {
    title: "Ubuntu 22.04 (Testing)",
    short: "Ubuntu 22.04 (Testing)",
    descr: "Upcoming Ubuntu 22.04 based software stack",
    group: "Ubuntu 22.04",
  },
} as const;

export const FALLBACK_SOFTWARE_ENV = {
  default: DEFAULT_COMPUTE_IMAGE,
  groups: GROUPS,
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

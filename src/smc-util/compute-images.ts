/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is tied to the back-end setup of cocalc.com

import { defaults, required } from "smc-util/misc";

import * as schema from "smc-util/db-schema";

export const DEFAULT_COMPUTE_IMAGE = schema.DEFAULT_COMPUTE_IMAGE;
export const FALLBACK_COMPUTE_IMAGE = schema.FALLBACK_COMPUTE_IMAGE;

interface ComputeImage {
  title: string;
  descr: string;
  order?: number;
  hidden?: boolean; // NYI
}

export const COMPUTE_IMAGES: { [key: string]: ComputeImage } = {
  // this is called "default", but treat it as if it is ubuntu1804
  // later, we'll switch DEFAULT_COMPUTE_IMAGE to be "ubuntu2004"
  default: {
    order: -10,
    title: "Ubuntu 18.04 (Default)",
    descr: "Regularly updated, well tested.",
  },
  ubuntu1804: {
    // just a synonym, at least for now
    order: 10,
    title: "Ubuntu 18.04",
    descr: "end of life fall 2020",
    hidden: true,
  },
  ubuntu2004: {
    order: -9,
    title: "Ubuntu 20.04",
    descr: "Will become the default in fall 2020",
  },
  previous: {
    order: -2,
    title: "Ubuntu 18.04 (Previous)",
    descr: "One or two weeks behind 'Ubuntu 18.04 (Default)'",
  },
  exp: {
    order: -1,
    title: "Experimental",
    descr: "Cutting-edge software updates (could be broken)",
  },
  "stable-2018-08-27": {
    title: "Ubuntu 18.04 @ 2018-08-27",
    descr: "Frozen on 2018-08-27 and no longer updated",
  },
  "stable-2019-01-12": {
    title: "Ubuntu 18.04 @ 2019-01-12",
    descr: "Frozen on 2019-01-12 and no longer updated",
  },
  "stable-2019-07-15": {
    title: "Ubuntu 18.04 @ 2019-07-15",
    descr: "Frozen on 2019-07-15 and no longer updated",
  },
  "stable-2019-10-25_ro": {
    title: "Ubuntu 18.04 @ 2019-10-25",
    descr: "Frozen on 2019-10-25 and no longer updated",
  },
  "stable-2019-12-15_ro": {
    title: "Ubuntu 18.04 @ 2019-12-15",
    descr: "Frozen on 2019-12-15 and no longer updated",
  },
  "stable-2020-01-26_ro": {
    title: "Ubuntu 18.04 @ 2020-01-26",
    descr: "Frozen on 2020-01-26 and no longer updated",
  },
  "stable-2020-07-31": {
    title: "Ubuntu 18.04 @ 2020-07-31",
    descr: "Frozen on 2020-07-31 and no longer updated",
  },
  old: {
    order: 10,
    title: "Old Ubuntu 16.04",
    descr: "In use until Summer 2018. No longer maintained!",
  },
} as const;

export function get_compute_images(opts) {
  opts = defaults(opts, { cb: required });
  opts.cb(undefined, COMPUTE_IMAGES);
}

export const is_valid = (name) => COMPUTE_IMAGES[name] != null;

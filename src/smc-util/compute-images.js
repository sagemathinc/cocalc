/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is tied to the back-end setup of cocalc.com

const { defaults, required } = require("smc-util/misc");

const {
  DEFAULT_COMPUTE_IMAGE,
  FALLBACK_COMPUTE_IMAGE,
} = require("smc-util/db-schema");

exports.DEFAULT_COMPUTE_IMAGE = DEFAULT_COMPUTE_IMAGE;
exports.FALLBACK_COMPUTE_IMAGE = FALLBACK_COMPUTE_IMAGE;

const COMPUTE_IMAGES = {
  // this is called "default", but treat it as if it is ubuntu1804
  // later, we'll switch DEFAULT_COMPUTE_IMAGE to be "ubuntu2004"
  default: {
    order: -10,
    title: "Default (Ubuntu 18.04)",
    descr: "Regularly updated, well tested.",
  },
  previous: {
    order: -9,
    title: "Previous (Ubuntu 18.04)",
    descr: "One or two weeks behind 'default'",
  },
  exp: {
    order: -1,
    title: "Experimental",
    descr: "Cutting-edge software updates (could be broken)",
  },
  "stable-2018-08-27": {
    title: "2018-08-27",
    descr: "Frozen on 2018-08-27 and no longer updated",
  },
  "stable-2019-01-12": {
    title: "2019-01-12",
    descr: "Frozen on 2019-01-12 and no longer updated",
  },
  "stable-2019-07-15": {
    title: "2019-07-15",
    descr: "Frozen on 2019-07-15 and no longer updated",
  },
  "stable-2019-10-25_ro": {
    title: "2019-10-25",
    descr: "Frozen on 2019-10-25 and no longer updated",
  },
  "stable-2019-12-15_ro": {
    title: "2019-12-15",
    descr: "Frozen on 2019-12-15 and no longer updated",
  },
  "stable-2020-01-26_ro": {
    title: "2020-01-26",
    descr: "Frozen on 2020-01-26 and no longer updated",
  },
  ubuntu2004: {
    order: 1,
    title: "Ubuntu 20.04",
    descr: "Ubuntu 20.04 (will become the default)",
  },
  old: {
    order: 10,
    title: "Old Ubuntu 16.04",
    descr: "In use until Summer 2018. No longer maintained!",
  },
};
exports.COMPUTE_IMAGES = COMPUTE_IMAGES;

exports.get_compute_images = (opts) => {
  opts = defaults(opts, { cb: required });
  opts.cb(undefined, COMPUTE_IMAGES);
};

exports.is_valid = (name) => {
  return COMPUTE_IMAGES[name] != null;
};

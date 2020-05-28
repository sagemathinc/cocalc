/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this is tied to the back-end setup of cocalc.com

const { defaults, required } = require("smc-util/misc");

const { DEFAULT_COMPUTE_IMAGE } = require("smc-util/db-schema");

exports.DEFAULT_COMPUTE_IMAGE = DEFAULT_COMPUTE_IMAGE;

const COMPUTE_IMAGES = {
  [DEFAULT_COMPUTE_IMAGE]: {
    order: -10,
    title: "Default",
    descr: "Regularly updated, well tested.",
  },
  previous: { order: -9, title: "Previous", descr: "One or two weeks behind 'default'" },
  exp: {
    order: -1,
    title: "Experimental",
    descr: "Cutting-edge software updates (could be broken)",
  },
  "stable-2018-08-27": {
    title: "2018-08-27",
    descr: "Frozen at 2018-08-27 and no longer updated",
  },
  "stable-2019-01-12": {
    title: "2019-01-12",
    descr: "Frozen at 2019-01-12 and no longer updated",
  },
  "stable-2019-07-15": {
    title: "2019-07-15",
    descr: "Frozeon at 2019-07-15 and no longer updated",
  },
  "stable-2019-10-25_ro": {
    title: "2019-10-25",
    descr: "Frozeon at 2019-10-25 and no longer updated",
  },
  "stable-2019-12-15_ro": {
    title: "2019-12-15",
    descr: "Frozeon at 2019-12-15 and no longer updated",
  },
  "stable-2020-01-26_ro": {
    title: "2020-01-26",
    descr: "Frozeon at 2020-01-26 and no longer updated",
  },
  ubuntu2004: {
    order: 1,
    title: "Ubuntu 20.04",
    descr: "Experimental Ubuntu 20.04 (could be broken)",
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

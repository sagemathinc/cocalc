/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// The whole purpose of this is to only load prettier if we really need it – this saves a few MB of project memory usage

let instance: { format: Function } | null = null;

export function get_prettier() {
  if (instance == null) {
    instance = require("prettier");
  }
  return instance;
}

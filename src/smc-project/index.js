/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

if (!process.env.SMC) {
  process.env.SMC = path.join(process.env.HOME, ".smc");
}

exports.local_hub = require("./local_hub.coffee");

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

require("coffeescript/register");
require("ts-node").register({
  cacheDirectory: process.env.HOME + "/.ts-node-cache",
});
require("../postgres.coffee");

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// So we can require typescript code:
require('ts-node').register({ cacheDirectory: process.env.HOME + '/.ts-node-cache' });

// So we can require coffeescript code.
require("coffeescript/register");
require("coffee2-cache").setCacheDir(
  ".coffee/cache"
); /* two level is NECESSARY; coffeescript doesn't get recompiled every time we require it */

require("../compute-server.coffee");

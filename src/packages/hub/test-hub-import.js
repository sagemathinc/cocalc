/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This loads code to generally improve the chances things will work when actually
launched.  This is run during the build process as a test.
Also, running this module populates ~/.ts-node-cache, which improves
server startup time significantly -- a few seconds instead of a
few **minutes**, since typescript is quite slow.
*/

require("coffeescript/register");
require("./hub.coffee");

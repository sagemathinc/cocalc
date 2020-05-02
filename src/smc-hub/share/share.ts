/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The share express server.
*/

/* node-cjsx:
Enable transparent server-side requiring of cjsx files.
We need this until all frontend smc-webapp code (used by the
share server) is converted to not be cjsx.  Note that any
frontend cjsx that uses coffeescript2 features like async/await
will break, due to node-cjsx being so old and burried.
*/
require("node-cjsx").transform();

import * as router from "./router";
export const share_router = router.share_router;

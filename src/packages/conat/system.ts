/*
This is a key:value store that hubs can write to and all
users of cocalc can read from.  It contains:

- recent system-wide notifications that haven't been canceled
  system.notifications.{random}

- the customize data: what used to be the /customize http endpoint
  this makes it so clients get notified whenever anything changes, e.g., when the
  recommended or required version changes, and can act accordingly.  The UI
  can also change.

Development:

~/cocalc/src/packages/server$ n
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> env = await require("@cocalc/backend/nats/env").getEnv(); a = require("@cocalc/conat/system"); s = new a.SystemKv(env); await s.init();

*/

import { GeneralKV } from "@cocalc/conat/sync/general-kv";

export class SystemKv extends GeneralKV {
  constructor(env) {
    super({ env, name: "system" });
  }
}

/*
Called when there is a request to access files/directories.

It:
   - does nothing...

But it might:
   - double check that request is currently allowed (use
     synctable for speed?)
   - ???

*/

import { defaults, required } from "smc-util/misc";

export function public_access_request(opts): void {
  opts = defaults(opts, {
    database: required,
    project_id: required,
    path: required,
    cb: required
  });
  // 1. check if valid
  // 2. increment database counter or log or something
  opts.cb(undefined, true);
}

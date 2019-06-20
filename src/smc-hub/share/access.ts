/*
Called when there is a request to access files/directories.

It:
   - does nothing and is not currently used.

But it might:
   - double check that request is currently allowed (use
     synctable for speed?)
   - ???

*/

import { Database } from "./types";

export async function public_access_request(opts: {
  database: Database;
  project_id: string;
  path: string;
}): Promise<void> {
  // 1. check if valid
  // 2. increment database counter or log or something
}

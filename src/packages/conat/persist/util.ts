/*

Maybe storage available as a service.

This code is similar to the changefeed server, because 
it provides a changefeed on a given persist storage, 
and a way to see values.

DEVELOPMENT:

Change to the packages/backend directory and run node.

TERMINAL 1: This sets up the environment and starts the server running:

   require('@cocalc/backend/conat/persist').initServer()


TERMINAL 2: In another node session, create a client:

    user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {id, lifetime, stream} = await require('@cocalc/backend/conat/persist').getAll({user, storage, options:{lifetime:1000*60}}); console.log({id}); for await(const x of stream) { console.log(x.data) }; console.log("DONE")

// client also does this periodically to keep subscription alive:

    await renew({user, id }) 

TERMINAL 3:

user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {set,get} = require('@cocalc/backend/conat/persist');  const { messageData } =require("@cocalc/conat/core/client"); 0;

   await set({user, storage, messageData:messageData('hi')})
   
   await get({user, storage,  seq:1})
   
   await set({user, storage, key:'bella', messageData:messageData('hi', {headers:{x:10}})})
   
   await get({user, storage,  key:'bella'})
   
Also getAll using start_seq:

   cf = const {id, lifetime, stream} = await require('@cocalc/backend/conat/persist').getAll({user, storage, start_seq:10, options:{lifetime:1000*60}}); for await(const x of stream) { console.log(x) };
*/

import { assertHasWritePermission } from "./auth";
import { pstream, PersistentStream } from "./storage";
import { join } from "path";
import { syncFiles, ensureContainingDirectoryExists } from "./context";

// this is per-server -- and "user" means where the resource is, usually
// a given project.  E.g., 500 streams in a project, across many users.
export const MAX_PER_USER = 500;
export const MAX_GLOBAL = 10000;
export const RESOURCE = "persistent storage";

//import { getLogger } from "@cocalc/conat/client";
//const logger = getLogger("persist:util");

export const SERVICE = "persist";

export type User = {
  account_id?: string;
  project_id?: string;
  hub_id?: string;
};

export function persistSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SERVICE}.account-${account_id}`;
  } else if (project_id) {
    return `${SERVICE}.project-${project_id}`;
  } else {
    return `${SERVICE}.hub`;
  }
}

export async function getStream({
  subject,
  storage,
}): Promise<PersistentStream> {
  // this permsissions check should always work and use should
  // never see an error here, since
  // the same check runs on the client before the message is sent to the
  // persist storage.  However a malicious user would hit this.
  // IMPORTANT: must be here so error *code* also sent back.
  assertHasWritePermission({
    subject,
    path: storage.path,
  });
  const path = join(syncFiles.local, storage.path);
  await ensureContainingDirectoryExists(path);
  return pstream({ ...storage, path });
}

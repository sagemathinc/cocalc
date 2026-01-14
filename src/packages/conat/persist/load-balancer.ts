/*
The persist load balancer listens for requests on the subject

   {SERVICE}.{scope}.id

- SERVICE (e.g., 'persist')
- scope it typically hub or account-...or project-....
- id is literally that.

It then responds with a persist server id from the ones that got started.
The persist server id is just a function of the scope, i.e,. we
just shard accounts and projects across the persist server, and that's
it.  The most important thing is that this assignment never changes
(unless you restart servers), because if two clients both fetch the
id for the same scope, they must get something on the same persist
server, since otherwise things could be out of sync.

If somehow two clients got different id's, that' wouldn't corrupt data on disk.
We always run different persist servers on the same machine with the same disk,
so since data is written with sqlite lite, nothing will literally be out sync,
since sqlite has locks and allows multiple processes to write to the same file.
However, the *change* events will not properly get sent out, and that will break
collaborative editing badly.
*/

import { type Client } from "@cocalc/conat/core/client";
import { getLogger } from "@cocalc/conat/client";
import { SERVICE } from "./util";
import { hash_string } from "@cocalc/util/misc";
import { delay } from "awaiting";

const logger = getLogger("persist:load-balancer");

export function initLoadBalancer({
  client,
  ids,
  service = SERVICE,
}: {
  client: Client;
  ids: string[];
  service?: string;
}) {
  if (ids.length == 0) {
    throw Error("there must be at least 1 id");
  }

  const subject = `${service}.*.id`;

  // I don't think subscription ever randomly throw errors, but this
  // is so important I'm making it extra paranoid:
  (async () => {
    while (true) {
      let sub: any = undefined;
      try {
        logger.debug("creating persist load balancer: ", { subject, ids });
        sub = await client.subscribe(subject);
        for await (const mesg of sub) {
          mesg.respondSync(getId(ids, mesg.subject));
        }
      } catch (err) {
        sub?.close();
        logger.debug("ERROR (restarting) -- ", err);
      }
      await delay(3000);
    }
  })();
}

// we use a hash so that this takes NO memory, but the assignment
// lasts forever, which means our sharding by server doesn't
// take into account load at all.  This keeps things much, much
// simpler, and should be fine in practice.
export function getId(ids: string[], subject: string) {
  const h = Math.abs(hash_string(subject.split(".")[1]));
  const id = ids[h % ids.length];
  //logger.debug("getId", { ids, subject, id });
  return id;
}

export async function getPersistServerId({
  client,
  subject,
}: {
  client: Client;
  subject: string;
}) {
  // take only first two segments of subject, since it could have a bunch more
  // that we better ignore (e.g., from the client)
  const s = subject.split(".").slice(0, 2).join(".") + ".id";
  const resp = await client.request(s, null);
  return resp.data;
}

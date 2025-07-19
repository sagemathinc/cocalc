import {
  before as before0,
  after as after0,
  client as client0,
} from "@cocalc/backend/conat/test/setup";
export { connect, wait } from "@cocalc/backend/conat/test/setup";
import {
  createPathFileserver,
  cleanupFileservers,
} from "@cocalc/backend/conat/files/test/util";
import { type Filesystem } from "@cocalc/conat/files/fs";
export { uuid } from "@cocalc/util/misc";
import { fsClient } from "@cocalc/conat/files/fs";
import syncstring0 from "@cocalc/backend/conat/sync-doc/syncstring";

export { client0 as client };

export let server, fs;

export async function before() {
  await before0();
  server = await createPathFileserver();
}

export function getFS(project_id: string, client?): Filesystem {
  return fsClient({
    subject: `${server.service}.project-${project_id}`,
    client: client ?? client0,
  });
}

export async function syncstring(opts) {
  return await syncstring0({ ...opts, service: server.service });
}

export async function after() {
  await cleanupFileservers();
  await after0();
}

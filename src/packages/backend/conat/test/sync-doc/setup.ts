import {
  before as before0,
  after as after0,
  client as client0,
} from "@cocalc/backend/conat/test/setup";
export { connect, wait, once, delay } from "@cocalc/backend/conat/test/setup";
import {
  createPathFileserver,
  cleanupFileservers,
} from "@cocalc/backend/conat/files/test/util";
export { uuid } from "@cocalc/util/misc";

export { client0 as client };

export let server, fs;

export async function before() {
  await before0();
  server = await createPathFileserver();
}

export async function after() {
  await cleanupFileservers();
  await after0();
}

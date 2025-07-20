import {
  before as before0,
  after as after0,
  client as client0,
  wait,
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

// wait until the state of several syncdocs all have same heads- they may have multiple
// heads, but they all have the same heads
export async function waitUntilSynced(syncdocs: any[]) {
  await wait({
    until: () => {
      const X = new Set<string>();
      for (const s of syncdocs) {
        X.add(JSON.stringify(s.patch_list.getHeads()?.sort()));
        if (X.size > 1) {
          return false;
        }
      }
      return true;
    },
  });
}

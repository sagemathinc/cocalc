/*
Tests that various sync functionality works after restarting the conat server.

pnpm test ./connectivity.test.ts 

*/

import { dkv } from "@cocalc/backend/conat/sync";
import { delay } from "awaiting";
import {
  before,
  after,
  connect,
  restartServer,
} from "@cocalc/backend/conat/test/setup";
import { wait } from "@cocalc/backend/conat/test/util";

beforeAll(before);

describe("test that dkv survives server restart", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("restarts the conat socketio server to make sure that works", async () => {
    await restartServer();
  });

  it("creates the dkv and does a basic test", async () => {
    kv = await dkv({ name });
    kv.a = 10;
    expect(kv.a).toEqual(10);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });

  it.skip("restart the socketio server and confirm that dkv still works", async () => {
    await restartServer();
    kv.b = 7;
    expect(kv.b).toEqual(7);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });
});

afterAll(after);

/*
Tests that various sync functionality works after restarting the conat server.

pnpm test ./connectivity.test.ts 

*/

import { dkv } from "@cocalc/backend/conat/sync";
import {
  before,
  after,
  restartServer,
  restartPersistServer,
  setDefaultTimeouts,
} from "@cocalc/backend/conat/test/setup";

beforeAll(before);

jest.setTimeout(10000);
describe("test that dkv survives server restart", () => {
  let kv;
  const name = `test-${Math.random()}`;

  it("restarts the conat socketio server to make sure that works", async () => {
    // some tests below will randomly sometimes take longer than 5s without this:
    setDefaultTimeouts({ request: 250, publish: 250 });
    await restartServer();
  });

  it("right as it restarts, creates the dkv and does a basic test", async () => {
    kv = await dkv({ name });
    kv.a = 10;
    expect(kv.a).toEqual(10);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });

  it("restart the socketio server and confirm that dkv still works", async () => {
    await restartServer();
    kv.b = 7;
    expect(kv.b).toEqual(7);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });

  it("restart again (without await) the socketio server and confirm that dkv still works", async () => {
    restartServer();
    kv.b = 77;
    expect(kv.b).toEqual(77);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });

  it("restart persist server", async () => {
    await restartPersistServer();
    kv.b = 123;
    expect(kv.b).toEqual(123);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });

  jest.setTimeout(10000);
  it("restart both servers at once", async () => {
    await Promise.all([restartPersistServer(), restartServer()]);
    kv.b = 389;
    expect(kv.b).toEqual(389);
    await kv.save();
    expect(kv.hasUnsavedChanges()).toBe(false);
  });
});

afterAll(after);

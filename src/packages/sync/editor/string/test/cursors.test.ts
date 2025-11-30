/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Cursor presence smoke test using the in-memory presence adapter fallback.
 */

import { once } from "@cocalc/util/async-utils";
import { Client, fs } from "./client-test";
import { SyncString } from "../sync";
import { a_txt } from "./data";

jest.setTimeout(20000);

describe("cursor presence emits cursor_activity", () => {
  const { project_id, path, init_queries } = a_txt();
  const string_id = "cursor-test";
  const clientA = new Client(init_queries, "userA");
  const clientB = new Client(init_queries, "userB");
  let syncA: SyncString;
  let syncB: SyncString;
  const eventsA: any[] = [];
  const cursorEvents: string[] = [];
  let handlerCalls = 0;

  beforeAll(async () => {
    syncA = new SyncString({ project_id, path, client: clientA, fs, cursors: true, string_id });
    syncB = new SyncString({ project_id, path, client: clientB, fs, cursors: true, string_id });
    await waitForReady(syncA);
    await waitForReady(syncB);
    expect(syncA.get_string_id()).toBe(string_id);
    expect(syncB.get_string_id()).toBe(string_id);
    const adapterA = (syncA as any).patchflowSession?.presenceAdapter;
    const adapterB = (syncB as any).patchflowSession?.presenceAdapter;
    expect(adapterA).toBe(adapterB);
    const sessionA = (syncA as any).patchflowSession;
    sessionA?.on("cursors", (payload) => {
      eventsA.push(payload);
    });
    syncA.on("cursor_activity", (key: string) => {
      cursorEvents.push(key);
    });
    const originalHandler = (syncA as any).handlePatchflowCursors.bind(syncA);
    sessionA?.on("cursors", (...args: any[]) => {
      handlerCalls += 1;
      originalHandler(...args);
    });
  });

  afterAll(async () => {
    await syncA.close();
    await syncB.close();
  });

  it("fires cursor_activity when another client updates cursors", async () => {
    await syncB.setCursorLocsNoThrottle([{ pos: 1 }]);
    await new Promise((r) => setTimeout(r, 200));
    const rawCursorsA =
      (syncA as any).patchflowSession?.cursors({ ttlMs: 1000 }) ?? [];
    const rawCursorsB =
      (syncB as any).patchflowSession?.cursors({ ttlMs: 1000 }) ?? [];
    expect(rawCursorsB.length).toBeGreaterThan(0);
    expect(eventsA.length).toBeGreaterThan(0);
    const cursors = syncA.get_cursors({ excludeSelf: "never" });
    expect(cursors.size).toBeGreaterThan(0);
    expect(handlerCalls).toBeGreaterThan(0);
    expect(cursorEvents.length).toBeGreaterThan(0);
  });
});

async function waitForReady(doc: SyncString): Promise<void> {
  if (doc.get_state() === "ready") return;
  await Promise.race([
    once(doc as any, "ready"),
    new Promise((_, reject) => setTimeout(() => reject(new Error("ready timeout")), 2000)),
  ]);
}

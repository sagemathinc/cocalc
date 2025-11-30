/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { once } from "@cocalc/util/async-utils";
import { a_txt } from "./data";
import { Client, fs } from "./client-test";
import { SyncString } from "../sync";

describe("before-change fires prior to merging remote patches", () => {
  it(
    "preserves unsaved local edits when a remote patch arrives",
    async () => {
    const { client_id, project_id, path, init_queries } = a_txt();
    const client = new Client(init_queries, `${client_id}-solo`);

    const sync1 = new SyncString({ project_id, path, client, fs });

    await once(sync1, "ready");

    // Seed the shared document so both clients start from the same state.
    sync1.from_str("hello world");
    await sync1.save();
    const baseDoc = sync1.version();
    const baseTime = sync1.versions()[0];
    expect(baseDoc.to_str()).toBe("hello world");
    expect(baseTime).toBeDefined();

    let beforeChangeFired = false;
    sync1.on("before-change", () => {
      beforeChangeFired = true;
    });
    const session: any = (sync1 as any).patchflowSession;
    let sessionBeforeChange = false;
    session.on("before-change", () => {
      sessionBeforeChange = true;
    });

    // Local unsaved edit (not yet committed).
    sync1.from_str("hello world\nLOCAL");

    // Simulate a remote patch arriving from another participant.
    const remoteDoc = (sync1 as any)._from_str("REMOTE\nhello world");
    const remotePatch = baseDoc.make_patch(remoteDoc);
    const time = Date.now() + 1;
    session.applyRemote({
      time,
      wall: time,
      patch: remotePatch,
      parents: [baseTime],
      userId: 42,
      version: 2,
    });

    await sync1.wait(() => sync1.to_str().includes("REMOTE"));

      expect(beforeChangeFired).toBe(true);
      expect(sessionBeforeChange).toBe(true);
      const final = sync1.to_str();
      expect(final).toContain("LOCAL");
      expect(final).toContain("REMOTE");
    },
    15000,
  );
});

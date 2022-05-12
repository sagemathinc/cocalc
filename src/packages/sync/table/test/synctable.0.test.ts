/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SyncTable } from "../synctable";
import { once } from "@cocalc/util/async-utils";
import { ClientTest } from "./client-test";

describe("tests public API of a system_notifications SyncTable", () => {
  let synctable: SyncTable;
  const notifications = [
    {
      id: "123e4567-e89b-12d3-a456-426655440000",
      time: new Date(),
      text: "This is a message.",
      priority: "low",
    },
    {
      id: "123e4567-e89b-12d3-a456-426655440001",
      time: new Date(),
      text: "This is a second message.",
      priority: "high",
    },
  ];
  const client = new ClientTest(notifications);
  const query = {
    system_notifications: [
      { id: null, time: null, text: null, priority: null },
    ],
  };

  test("create the synctable", async () => {
    // last 0 is to disable change throttling, which messes up jest.
    synctable = new SyncTable(query, [], client, 0);
    expect(synctable.get_state()).toBe("disconnected");
    await once(synctable, "connected");
  });

  test("get query the synctable", () => {
    const x = synctable.get();
    if (x == null) {
      throw Error("must be defined since synctable is connected");
    }
    expect(x.toJS()).toEqual({
      [notifications[0].id]: notifications[0],
      [notifications[1].id]: notifications[1],
    });
  });

  test("get_one query the synctable", () => {
    const x = synctable.get_one();
    if (x == null) {
      throw Error("must be defined since synctable is connected");
    }
    expect(x.toJS()).toEqual(notifications[0]);
  });

  test("get_one query for one primary key", () => {
    const x = synctable.get_one(notifications[0].id);
    if (x == null) {
      throw Error("must be defined since synctable is connected");
    }
    expect(x.toJS()).toEqual(notifications[0]);
    expect(x).toBe(synctable.get(notifications[0].id));
  });

  test("get_one query for other primary key", () => {
    const x = synctable.get_one(notifications[1].id);
    if (x == null) {
      throw Error("must be defined since synctable is connected");
    }
    expect(x.toJS()).toEqual(notifications[1]);
    // also the get is the same when there is an arg.
    expect(x).toBe(synctable.get(notifications[1].id));
  });

  test("get_one query for other primary key", () => {
    const x = synctable.get_one("foo");
    expect(x).toBe(undefined);
    // also the get is the same when there is an arg.
    expect(x).toBe(synctable.get("foo"));
  });

  test("does not have uncommitted changes", () => {
    expect(synctable.has_uncommitted_changes()).toBe(false);
  });

  test("making change to invalid field raises error", () => {
    expect(() => synctable.set({ foobar: "medium" })).toThrow(
      "Cannot coerce: no field 'foobar' in table system_notifications"
    );
  });

  test("making change to field not in query (even though it is valid) raises error", () => {
    expect(() => synctable.set({ done: true })).toThrow("coerce");
  });

  test("make change; then has uncommitted changes", () => {
    expect(client.set_queries.length).toBe(0);
    synctable.set({ id: notifications[1].id, priority: "medium" });
    // Set does not cause a database write (via save).
    expect(client.set_queries.length).toBe(0);
    expect(synctable.has_uncommitted_changes()).toBe(true);
  });

  test("save change; then does not have uncommitted changes", async () => {
    await synctable.save();
    // Set causes a database write:
    expect(client.set_queries.length).toBe(1);
    expect(synctable.has_uncommitted_changes()).toBe(false);
  });

  test("waiting for a condition to be satisfied", async () => {
    function satisfy_condition() {
      synctable.set({ id: notifications[1].id, priority: "high" });
      synctable.save();
    }

    function until(s) {
      const priority = s.get(notifications[1].id).get("priority");
      return priority === "high";
    }

    const p = synctable.wait(until);
    satisfy_condition();
    await p;
  });

  // @ts-ignore
  test("a change event", async (done) => {
    synctable.once("change", (keys) => {
      expect(keys).toEqual(["123e4567-e89b-12d3-a456-426655440001"]);
      done();
    });
    synctable.set({ id: notifications[1].id, priority: "medium" });
    await synctable.save();
  });

  test("closing the synctable", async () => {
    const n = client.set_queries.length;
    expect(synctable.get_state()).toBe("connected");
    synctable.set({ id: notifications[1].id, priority: "low" });
    expect(synctable.has_uncommitted_changes()).toBe(true);
    synctable.close();
    await once(synctable, "closed");
    expect(client.set_queries.length).toBe(n + 1); // final save happened
  });

  test("closed synctable -- has the right state", () => {
    expect(synctable.get_state()).toBe("closed");
  });

  test("closed synctable -- most public API functions throw an error", async () => {
    expect(() => synctable.set({ priority: "medium" })).toThrow(
      "can't set until table is initialized"
    );
    expect(() => synctable.get()).toThrow("closed");
    expect(() => synctable.get_one()).toThrow("table not yet initialized");
    expect(synctable.has_uncommitted_changes()).toBe(false); // does not throw
    await synctable.close();
    try {
      await synctable.wait(() => true);
    } catch (err) {
      expect(err.toString()).toContain("closed");
    }
    try {
      await synctable.save();
    } catch (err) {
      expect(err.toString()).toContain("closed");
    }
  });

  // some errors...

  test("try create synctable with an invalid query and get exception", () => {
    const invalid_query = {
      // invalid since missing id primary key.
      system_notifications: [{ time: null, text: null, priority: null }],
    };
    expect(() => new SyncTable(invalid_query, [], client, 0)).toThrow(
      "primary key"
    );
  });

  test("try create synctable with another invalid query and get exception", () => {
    const invalid_query = {
      // invalid since extra foo key.
      system_notifications: [
        { id: null, foo: null, time: null, text: null, priority: null },
      ],
    };
    expect(() => new SyncTable(invalid_query, [], client, 0)).toThrow(
      "field in the schema"
    );
  });
});

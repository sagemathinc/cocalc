import { Client } from "./client-test";
import { SyncString } from "../sync";
import { once } from "../../../../async-utils";
import { a_txt } from "./data";

describe("create syncstring and test doing some edits", () => {
  const { client_id, project_id, path, init_queries, string_id } = a_txt();
  const client = new Client(init_queries, client_id);
  let syncstring: SyncString;
  const v = [
    "SageMathCloud",
    "SageMathCloud -- Collaborative Calculation",
    "CoCalc -- Collaborative Calculation"
  ];

  it("creates the syncstring and wait until ready", async () => {
    syncstring = new SyncString({ project_id, path, client, cursors: true });
    expect(syncstring.get_state()).toBe("init");
    await once(syncstring, "ready");
  });

  it("sets the value and commit change", async () => {
    for (let i = 0; i < v.length; i++) {
      syncstring.from_str(v[i]);
      expect(syncstring.to_str()).toBe(v[i]);
      expect(syncstring.count()).toBe(v[i].length);
      expect(syncstring.versions().length).toBe(i);
      await syncstring.save();
      expect(syncstring.versions().length).toBe(i + 1);
    }
  });

  it("gets the value at each past version", () => {
    const vers = syncstring.versions();
    for (let i = 0; i < v.length; i++) {
      expect(syncstring.version(vers[i]).to_str()).toEqual(v[i]);
    }
  });

  it("undo it all", () => {
    for (let i = 0; i < v.length; i++) {
      syncstring.set_doc(syncstring.undo());
      let e = v[v.length - i - 2];
      if (e === undefined) {
        e = "";
      }
      expect(syncstring.to_str()).toEqual(e);
      expect(syncstring.in_undo_mode()).toBe(true);
    }
    // we made lots of changes with undo/redo, but didn't
    // save as new commits!
    expect(syncstring.versions().length).toBe(v.length);
  });

  it("redo it all (undo mode state continues from above)", () => {
    expect(syncstring.in_undo_mode()).toBe(true);
    for (let i = 0; i < v.length; i++) {
      syncstring.set_doc(syncstring.redo());
      expect(syncstring.to_str()).toEqual(v[i]);
    }
    syncstring.exit_undo_mode();
    expect(syncstring.in_undo_mode()).toBe(false);
    // correct, since no saves.
    expect(syncstring.versions().length).toBe(v.length);
  });

  it("revert to each past point in time", () => {
    const vers = syncstring.versions();
    for (let i = 0; i < v.length; i++) {
      syncstring.revert(vers[i]);
      expect(syncstring.to_str()).toEqual(v[i]);
    }
    // correct, since no saves.
    expect(syncstring.versions().length).toBe(v.length);
  });

  it("gets info about patch at a given point in time", () => {
    const t = syncstring.versions()[1];
    expect(syncstring.account_id(t)).toEqual(client_id);

    // time sent is not set since patch wasn't made offline.
    expect(syncstring.time_sent(t)).toBe(undefined);

    expect(syncstring.user_id(t)).toEqual(1);
  });

  it("last_changed is the time of the last version", () => {
    const vers = syncstring.versions();
    expect(syncstring.last_changed()).toEqual(vers[vers.length - 1]);
  });

  it("test setting and getting cursors", () => {
    expect(syncstring.get_cursors().toJS()).toEqual({});
    syncstring.set_cursor_locs([{ x: 2, y: 3 }, { x: 8, y: 12 }]);
    // Still empty, since we don't include our own cursors.
    expect(syncstring.get_cursors().toJS()).toEqual({});
    // Temporarily change our client_id so we can
    // see the cursor we set.
    const f = client.client_id;
    client.client_id = () => "";
    const x = syncstring.get_cursors().toJS();
    expect(x).toEqual({
      [client_id]: {
        locs: [{ x: 2, y: 3 }, { x: 8, y: 12 }],
        string_id,
        time: x[client_id].time,
        user_id: 1
      }
    });
    client.client_id = f;
  });

  it("is not read only", () => {
    expect(syncstring.is_read_only()).toBe(false);
  });

  it("save to disk", async () => {
    expect(syncstring.has_unsaved_changes()).toBe(true);
    const promise = syncstring.save_to_disk();
    // Mock: we set save to done in the syncstring
    // table, otherwise the promise will never resolve.
    (syncstring as any).set_save({
      state: "done",
      error: "",
      hash: syncstring.hash_of_live_version()
    });
    (syncstring as any).syncstring_table.emit("change-no-throttle");
    await promise;
    expect(syncstring.has_unsaved_changes()).toBe(false);
  });

  it("close and clean up", async () => {
    await syncstring.close();
    expect(syncstring.get_state()).toBe("closed");
  });
});

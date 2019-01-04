import { Client } from "./client-test";
import { SyncString } from "../sync";
import { once } from "../../../../async-utils";
import { a_txt } from "./data";

describe("create syncstring and test doing some edits", () => {
  const { client_id, project_id, path, init_queries } = a_txt();
  const client = new Client(init_queries, client_id);
  let syncstring: SyncString;
  const v = [
    "SageMathCloud",
    "SageMathCloud -- Collaborative Calculation",
    "CoCalc -- Collaborative Calculation"
  ];

  it("creates the syncstring and makes a change", async () => {
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
        e = '';
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

  it("close and clean up", () => {
    syncstring.close();
    expect(syncstring.get_state()).toBe("closed");
  });
});

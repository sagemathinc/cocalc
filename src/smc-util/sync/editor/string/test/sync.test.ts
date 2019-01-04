import { Client } from "./client-test";
import { SyncString } from "../sync";
import { once } from "../../../../async-utils";
import { client_db } from "../../../../schema";

describe("create a string SyncDoc and call public methods on it", () => {
  const client_id = "72570709-2eb2-499f-a7d2-38978d8c7393";
  const project_id = "ae1d6165-1310-4949-b266-e0448fdd065f";
  const path = "a.txt";
  const string_id = client_db.sha1(project_id, path);
  const init_queries = {
    syncstrings: [
      {
        snapshot_interval: 5,
        project_id,
        path,
        users: [project_id, client_id],
        string_id,
        last_active: "2019-01-04T18:24:08.806Z",
        init: { time: "2019-01-04T18:24:09.878Z", size: 0, error: "" },
        doctype: '{"type":"string"}',
        read_only: false,
        deleted: false,
        save: { state: "done", error: "", hash: 0, time: 1546626249624 }
      }
    ]
  };
  const client = new Client(init_queries, client_id);
  let syncstring: SyncString;

  it("creates the syncstring and wait for it to be ready", async () => {
    syncstring = new SyncString({ project_id, path, client });
    expect(syncstring.get_state()).toBe("init");
    await once(syncstring, "ready");
    expect(syncstring.get_state()).toBe("ready");
  });

  it("call set_cursor_locs, an error since cursors aren't enabled", () => {
    expect(() => syncstring.set_cursor_locs([])).toThrow(
      "cursors are not enabled"
    );
  });

  it("calls each public get method", () => {
    expect(syncstring.get_state()).toBe("ready");
    expect(syncstring.get_project_id()).toBe(project_id);
    expect(syncstring.get_path()).toBe(path);
    expect(syncstring.get_string_id()).toBe(string_id);
    expect(syncstring.get_my_user_id()).toBe(1);
  });

  it("get the underlying doc", () => {
    // via Document
    expect(syncstring.get_doc().to_str()).toBe("");
    // directly
    expect(syncstring.to_str()).toBe("");
  });

  it("get the size via count", () => {
    expect(syncstring.count()).toBe(0);
  });

  it("get current version", () => {
    expect(syncstring.version().to_str()).toBe("");
  });

  it("get version without (removing nothing though)", () => {
    expect(syncstring.version_without([]).to_str()).toBe("");
    expect(syncstring.version_without([new Date()]).to_str()).toBe("");
  });

  it("revert to version now (does nothing - no error)", () => {
    syncstring.revert(new Date());
  });

  it("undo/redo -- nothing to undo yet...", () => {
    expect(syncstring.in_undo_mode()).toBe(false);
    syncstring.undo();
    expect(syncstring.in_undo_mode()).toBe(true);
    syncstring.exit_undo_mode();
    expect(syncstring.in_undo_mode()).toBe(false);
    syncstring.redo(); // no error
  });

  it("account_id of change at given point in time gives error", () => {
    expect(() => syncstring.account_id(new Date())).toThrow("no patch at");
  });

  it("time sent of change at given point in time gives error", () => {
    expect(() => syncstring.time_sent(new Date())).toThrow("no patch at");
  });

  it("user_id of change at given point in time gives error", () => {
    expect(() => syncstring.time_sent(new Date())).toThrow("no patch at");
  });

  it("close and clean up", () => {
    expect(syncstring.get_state()).toBe("ready");
    syncstring.close();
    expect(syncstring.get_state()).toBe("closed");
  });
});

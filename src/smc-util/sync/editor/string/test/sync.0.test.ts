import { Client } from "./client-test";
import { SyncString } from "../sync";
import { once } from "../../../../async-utils";
import { a_txt } from "./data";

// This mostly tests the trivial minimal edge cases.
describe("create a blank minimal string SyncDoc and call public methods on it", () => {
  const { client_id, project_id, path, string_id, init_queries } = a_txt();
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

  it("the db-style get methods all fail on a string", () => {
    expect(() => syncstring.get()).toThrow(
      "queries on strings don't have meaning"
    );
    expect(() => syncstring.get_one()).toThrow(
      "queries on strings don't have meaning"
    );
    expect(() => syncstring.delete()).toThrow(
      "delete on strings doesn't have meaning"
    );
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
    expect(() => syncstring.user_id(new Date())).toThrow("no patch at");
  });

  it("get list of versions (should be empty)", () => {
    expect(syncstring.versions()).toEqual([]);
  });

  it("get all known versions (also empty)", () => {
    expect(syncstring.all_versions()).toEqual([]);
  });

  it("last changed when time began", () => {
    expect(syncstring.last_changed()).toEqual(new Date(0));
  });

  it("check ready state", async () => {
    syncstring.assert_is_ready();
    await syncstring.wait_until_ready(); // trivial since already ready
  });

  it("wait for an already true condition", async () => {
    await syncstring.wait(() => true);
  });

  it("get cursors (error, since cursors not enabled)", async () => {
    expect(() => syncstring.get_cursors()).toThrow("cursors are not enabled");
  });

  it("set, then get, something from the settings field", async () => {
    await syncstring.set_settings({ foo: { bar: "none" } });
    expect(
      syncstring
        .get_settings()
        .get("foo")
        .toJS()
    ).toEqual({ bar: "none" });
  });

  it("verifies it has the full history already", () => {
    expect(syncstring.has_full_history()).toBe(true);
  });

  it("loads full history (which does basically nothing)", async () => {
    await syncstring.load_full_history();
  });

  it("do a save (no-op, since haven't done anything yet)", async () => {
    await syncstring.save();
  });

  it("change the snapshot interval", async () => {
    await syncstring.set_snapshot_interval(17);
    expect((syncstring as any).snapshot_interval).toBe(17);
  });

  it("read only checks", async () => {
    await syncstring.wait_until_read_only_known(); // no-op
    expect(syncstring.is_read_only()).toBe(false);
  });

  it("hashes of versions", () => {
    expect(syncstring.hash_of_saved_version()).toBe(0);
    expect(syncstring.hash_of_live_version()).toBe(0);
    expect(syncstring.has_uncommitted_changes()).toBe(false);
  });

  it("saves to disk (no-op, since nothing changed)", async () => {
    await syncstring.save_to_disk();
  });

  it("close and clean up", async () => {
    expect(syncstring.get_state()).toBe("ready");
    await syncstring.close();
    expect(syncstring.get_state()).toBe("closed");
  });
});

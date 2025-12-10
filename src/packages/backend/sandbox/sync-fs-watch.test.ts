import { SyncFsWatchStore } from "./sync-fs-watch";
import { tmpNameSync } from "tmp-promise";

describe("SyncFsWatchStore", () => {
  it("stores content and computes a patch for external changes", async () => {
    const store = new SyncFsWatchStore();
    store.setContent("a.txt", "hello");

    const result = await store.handleExternalChange("a.txt", async () => "hello world");

    expect(result.deleted).toBe(false);
    expect(result.content).toBe("hello world");
    expect(result.patch).toBeDefined();
    store.close();
  });

  it("marks deletes without throwing", () => {
    const store = new SyncFsWatchStore();
    store.setContent("b.txt", "data");
    store.markDeleted("b.txt");

    const state = store.get("b.txt");
    expect(state?.deleted).toBe(true);
    store.close();
  });

  it("persists fs heads with heads and lastSeq", () => {
    const dbPath = tmpNameSync({ prefix: "sync-fs-heads-", postfix: ".db" });
    const store1 = new SyncFsWatchStore(dbPath);
    store1.setFsHead({
      string_id: "s1",
      time: 10,
      version: 3,
      heads: [8, 10],
      lastSeq: 42,
    });
    store1.close();

    const store2 = new SyncFsWatchStore(dbPath);
    const head = store2.getFsHead("s1");
    expect(head?.time).toBe(10);
    expect(head?.version).toBe(3);
    expect(head?.lastSeq).toBe(42);
    expect(head?.heads).toEqual([8, 10]);
    store2.close();
  });
});

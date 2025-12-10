import { SyncFsWatchStore } from "./sync-fs-watch";

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
});

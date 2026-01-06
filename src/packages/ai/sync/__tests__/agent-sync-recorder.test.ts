import { EventEmitter } from "node:events";

import type { Client as ConatClient } from "@cocalc/conat/core/client";
import type { JSONValue } from "@cocalc/util/types";

import { AgentTimeTravelRecorder } from "../agent-sync-recorder";

type ReadState = {
  patchId: string;
  atMs: number;
  lastReadTurnId?: string;
};

type CommitEntry = {
  content: string;
  meta?: { [key: string]: JSONValue };
};

class FakeSyncDoc extends EventEmitter {
  private content: string;
  private readonly versionMap: Map<string, string>;
  private readonly versionList: string[];
  public commitCalls: CommitEntry[] = [];

  constructor(opts: {
    content: string;
    versions: string[];
    versionMap: Map<string, string>;
  }) {
    super();
    this.content = opts.content;
    this.versionList = [...opts.versions];
    this.versionMap = opts.versionMap;
  }

  isReady() {
    return true;
  }

  to_str() {
    return this.content;
  }

  from_str(value: string) {
    this.content = value;
  }

  commit({ meta }: { meta?: { [key: string]: JSONValue } } = {}) {
    this.commitCalls.push({ content: this.content, meta });
    this.versionList.push(`patch-${this.versionList.length + 1}`);
    return true;
  }

  versions() {
    return [...this.versionList];
  }

  newestVersion() {
    return this.versionList[this.versionList.length - 1];
  }

  hasVersion(patchId: string) {
    return this.versionMap.has(patchId);
  }

  version(patchId: string) {
    const content = this.versionMap.get(patchId) ?? "";
    return { to_str: () => content };
  }

  override once(event: "ready" | "error", handler: (arg?: unknown) => void) {
    return super.once(event, handler);
  }

  close() {
    return Promise.resolve();
  }
}

function makeStore() {
  const map = new Map<string, ReadState>();
  return {
    map,
    store: {
      get: async (key: string) => map.get(key),
      set: async (key: string, value: ReadState) => {
        map.set(key, value);
      },
      delete: async (key: string) => {
        map.delete(key);
      },
    },
  };
}

describe("AgentTimeTravelRecorder", () => {
  const homeRoot = "/home/test";
  const workspaceRoot = "/home/test/project";
  const threadRootDate = "2024-01-01T00:00:00Z";
  const turnDate = "2024-01-01T00:01:00Z";
  const baseOptions = {
    project_id: "proj",
    chat_path: "chat",
    thread_root_date: threadRootDate,
    turn_date: turnDate,
    log_store: "store",
    log_key: "key",
    log_subject: "subject",
    workspaceRoot,
    client: {} as unknown as ConatClient,
  };

  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = homeRoot;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("stores the latest patch id on read", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "initial",
      versions: ["p1"],
      versionMap: new Map([["p1", "initial"]]),
    });
    const { map, store } = makeStore();
    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
    });

    await recorder.recordRead("src/file.txt", turnDate);

    const key = `agent-tt:${threadRootDate}:file:src/file.txt`;
    expect(map.get(key)?.patchId).toBe("p1");
    await recorder.dispose();
  });

  it("seeds the syncdoc from disk when no patch id exists", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "stale",
      versions: [],
      versionMap: new Map(),
    });
    const { store } = makeStore();
    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      readFile: async () => "seeded",
    });

    await recorder.recordRead("src/file.txt", turnDate);

    expect(syncDoc.to_str()).toBe("seeded");
    await recorder.dispose();
  });

  it("commits without a read state when allowed", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "before",
      versions: [],
      versionMap: new Map(),
    });
    const { store } = makeStore();
    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      readFile: async () => "after",
      allowWriteWithoutRead: true,
    });

    await recorder.recordWrite("src/file.txt", turnDate);

    expect(syncDoc.commitCalls).toHaveLength(1);
    await recorder.dispose();
  });

  it("commits a patch with metadata on write", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "before",
      versions: ["p1"],
      versionMap: new Map([["p1", "before"]]),
    });
    const { map, store } = makeStore();
    const key = `agent-tt:${threadRootDate}:file:src/file.txt`;
    map.set(key, { patchId: "p1", atMs: Date.now() });

    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      readFile: async () => "after",
    });

    await recorder.recordWrite("src/file.txt", turnDate);

    expect(syncDoc.commitCalls).toHaveLength(1);
    expect(syncDoc.commitCalls[0].meta?.source).toBe("agent");
    await recorder.dispose();
  });

  it("skips writes when the head already matches disk", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "same",
      versions: ["p1"],
      versionMap: new Map([["p1", "same"]]),
    });
    const { map, store } = makeStore();
    const key = `agent-tt:${threadRootDate}:file:src/file.txt`;
    map.set(key, { patchId: "p1", atMs: Date.now() });

    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      readFile: async () => "same",
    });

    await recorder.recordWrite("src/file.txt", turnDate);

    expect(syncDoc.commitCalls).toHaveLength(0);
    await recorder.dispose();
  });
});

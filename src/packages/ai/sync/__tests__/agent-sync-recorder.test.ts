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
    this.emit("change");
    return true;
  }

  addVersion(patchId: string, content?: string) {
    this.versionList.push(patchId);
    if (content !== undefined) {
      this.versionMap.set(patchId, content);
    }
    this.emit("change");
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

  override once(
    event: "ready" | "error" | "change",
    handler: (arg?: unknown) => void,
  ) {
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

    const key = `agent-tt:${threadRootDate}:file:project/src/file.txt`;
    expect(map.get(key)?.patchId).toBe("p1");
    await recorder.dispose();
  });

  it("waits for a patch id when none exists", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "stale",
      versions: [],
      versionMap: new Map(),
    });
    const { map, store } = makeStore();
    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      writeCommitWaitMs: 50,
    });

    const readPromise = recorder.recordRead("src/file.txt", turnDate);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    syncDoc.addVersion("p1", "seeded");
    await readPromise;

    const key = `agent-tt:${threadRootDate}:file:project/src/file.txt`;
    expect(map.get(key)?.patchId).toBe("p1");
    await recorder.dispose();
  });

  it("waits for a new patch id on write", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "before",
      versions: ["p1"],
      versionMap: new Map([["p1", "before"]]),
    });
    const { store } = makeStore();
    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      writeCommitWaitMs: 50,
    });

    const writePromise = recorder.recordWrite("src/file.txt", turnDate);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    syncDoc.addVersion("p2");
    await writePromise;

    expect(syncDoc.commitCalls).toHaveLength(0);
    await recorder.dispose();
  });

  it("returns when no commit is observed", async () => {
    const syncDoc = new FakeSyncDoc({
      content: "same",
      versions: ["p1"],
      versionMap: new Map([["p1", "same"]]),
    });
    const { store } = makeStore();
    const recorder = new AgentTimeTravelRecorder({
      ...baseOptions,
      readStateStore: store,
      syncFactory: async () => syncDoc,
      writeCommitWaitMs: 20,
    });

    await recorder.recordWrite("src/file.txt", turnDate);

    expect(syncDoc.commitCalls).toHaveLength(0);
    await recorder.dispose();
  });
});

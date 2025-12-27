import type { AppRedux } from "@cocalc/util/redux/types";
import type { PatchId } from "@cocalc/sync";
import type { SyncString } from "@cocalc/sync/editor/string/sync";
import { TextEditorActions } from "../actions-text";
import { StructuredEditorActions } from "../actions-structured";
import { MergeCoordinator } from "../../code-editor/sync";

class TestMergeCoordinator extends MergeCoordinator {
  constructor(private seedCalls: Array<{ value: string; version?: PatchId }>) {
    super({ getLocal: () => "local", applyMerged: () => {} });
  }

  override seedBase(value: string, version?: PatchId): void {
    this.seedCalls.push({ value, version });
    super.seedBase(value, version);
  }
}

class TestTextActions extends TextEditorActions {
  public seedCalls: Array<{ value: string; version?: PatchId }> = [];

  public setDoctype(value: string): void {
    this.doctype = value;
  }

  public setSyncString(sync: SyncString): void {
    this._syncstring = sync;
  }

  public runInitSyncStringValue(): void {
    this._init_syncstring_value();
  }

  public hasSyncAdapter(): boolean {
    return this.syncAdapter != null;
  }

  protected getMergeCoordinator(): MergeCoordinator {
    return new TestMergeCoordinator(this.seedCalls);
  }

  protected getLatestVersion(): PatchId | undefined {
    return "1_abcd" as PatchId;
  }
}

class TestStructuredActions extends StructuredEditorActions {
  public setSyncString(sync: SyncString): void {
    this._syncstring = sync;
  }

  public runInitSyncStringValue(): void {
    this._init_syncstring_value();
  }
}

function makeRedux(): AppRedux {
  return {
    getStore: jest.fn(),
    _set_state: jest.fn(),
    removeActions: jest.fn(),
  } as unknown as AppRedux;
}

function makeSyncStub() {
  return {
    to_str: jest.fn().mockReturnValue("hello"),
    on: jest.fn(),
    off: jest.fn(),
  };
}

describe("Base editor action structure", () => {
  it("TextEditorActions uses to_str and wires SyncAdapter for syncstring", () => {
    const redux = makeRedux();
    const actions = new TestTextActions("test-text", redux);
    const sync = makeSyncStub();

    actions.setSyncString(sync as unknown as SyncString);
    actions.setDoctype("syncstring");
    actions.runInitSyncStringValue();

    expect(sync.to_str).toHaveBeenCalled();
    expect(actions.seedCalls).toHaveLength(1);
    expect(actions.hasSyncAdapter()).toBe(true);
    expect(sync.on).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("TextEditorActions skips SyncAdapter for non-syncstring doctypes", () => {
    const redux = makeRedux();
    const actions = new TestTextActions("test-text", redux);
    const sync = makeSyncStub();

    actions.setSyncString(sync as unknown as SyncString);
    actions.setDoctype("syncdb");
    actions.runInitSyncStringValue();

    expect(sync.to_str).toHaveBeenCalled();
    expect(actions.hasSyncAdapter()).toBe(false);
  });

  it("StructuredEditorActions does not touch to_str", () => {
    const redux = makeRedux();
    const actions = new TestStructuredActions("test-structured", redux);
    const sync = makeSyncStub();

    actions.setSyncString(sync as unknown as SyncString);
    actions.runInitSyncStringValue();

    expect(sync.to_str).not.toHaveBeenCalled();
  });
});

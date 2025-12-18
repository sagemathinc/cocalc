/// <reference types="jest" />

import { MergeCoordinator } from "../sync";

describe("MergeCoordinator", () => {
  test("merges remote while preserving local edits", () => {
    let localBuffer = "abc";
    let applied: string | undefined;

    const coordinator = new MergeCoordinator({
      getLocal: () => localBuffer,
      applyMerged: (merged) => {
        applied = merged;
        localBuffer = merged;
      },
    });

    coordinator.seedBase("abc", "1");
    // Local user inserts X before 'c'.
    localBuffer = "abXc";
    // Remote appends Y.
    coordinator.mergeRemote("abcY", "2");

    expect(applied).toBe("abXcY");
    expect(localBuffer).toBe("abXcY");
  });

  test("preserves uncommitted local across successive remotes", () => {
    let localBuffer = "abc";
    let applied: string | undefined;

    const coordinator = new MergeCoordinator({
      getLocal: () => localBuffer,
      applyMerged: (merged) => {
        applied = merged;
        localBuffer = merged;
      },
    });

    coordinator.seedBase("abc", "1");
    // Local edit: insert X.
    localBuffer = "abXc";
    // First remote: append Y.
    coordinator.mergeRemote("abcY", "2");
    expect(applied).toBe("abXcY");
    // Second remote: append Z (doesn't have X).
    coordinator.mergeRemote("abcYZ", "3");
    expect(applied).toBe("abXcYZ");
    expect(localBuffer).toBe("abXcYZ");
  });

  test("non-overlapping edits merge (base/local/remote example)", () => {
    const base = "aaa\n\n---\n\nzzz";
    const localEdits = "aaa\n\n---\n\nzzzxxx"; // local appends xxx
    const remoteEdits = "aaaeee\n\n---\n\nzzz"; // remote inserts eee near start

    let localBuffer = localEdits;
    let applied: string | undefined;
    const coordinator = new MergeCoordinator({
      getLocal: () => localBuffer,
      applyMerged: (merged) => {
        applied = merged;
        localBuffer = merged;
      },
    });
    coordinator.seedBase(base, "1");
    coordinator.mergeRemote(remoteEdits, "2");
    expect(applied).toBe("aaaeee\n\n---\n\nzzzxxx");
    expect(localBuffer).toBe("aaaeee\n\n---\n\nzzzxxx");
  });
});

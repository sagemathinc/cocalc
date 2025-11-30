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

    coordinator.seedBase("abc", 1);
    // Local user inserts X before 'c'.
    localBuffer = "abXc";
    // Remote appends Y.
    coordinator.mergeRemote("abcY", 2);

    expect(applied).toBe("abXcY");
    expect(localBuffer).toBe("abXcY");
  });
});

/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getSessionsToPrune } from "./use-agent-session";

describe("getSessionsToPrune", () => {
  test("returns no sessions when under the limit", () => {
    expect(
      getSessionsToPrune([
        { sessionId: "a", earliestDate: "2026-01-01T00:00:00.000Z" },
        { sessionId: "b", earliestDate: "2026-01-02T00:00:00.000Z" },
      ]),
    ).toEqual([]);
  });

  test("prunes the oldest sessions first", () => {
    const sessions = [
      { sessionId: "a", earliestDate: "2026-01-01T00:00:00.000Z" },
      { sessionId: "b", earliestDate: "2026-01-02T00:00:00.000Z" },
      { sessionId: "c", earliestDate: "2026-01-03T00:00:00.000Z" },
    ];
    expect(getSessionsToPrune(sessions, { maxSessions: 2 })).toEqual(["a"]);
  });

  test("does not prune protected sessions", () => {
    const sessions = [
      { sessionId: "a", earliestDate: "2026-01-01T00:00:00.000Z" },
      { sessionId: "b", earliestDate: "2026-01-02T00:00:00.000Z" },
      { sessionId: "c", earliestDate: "2026-01-03T00:00:00.000Z" },
    ];
    expect(
      getSessionsToPrune(sessions, {
        maxSessions: 2,
        protectedSessionIds: new Set(["a"]),
      }),
    ).toEqual(["b"]);
  });
});

/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";

import { ProcessStats } from "./process-stats";

describe("process-stats", () => {
  it("collects sane process information", async () => {
    const stats = ProcessStats.getInstance();
    await stats.init();

    const result = await stats.processes("process-stats-test");
    const now = Date.now();

    expect(result.uptime).toBeGreaterThan(0);
    expect(result.boottime.getTime()).toBeGreaterThan(0);
    expect(result.boottime.getTime()).toBeLessThan(now);

    const pids = Object.keys(result.procs);
    expect(pids.length).toBeGreaterThan(0);

    const sample = result.procs[pids[0]];
    expect(Number.isFinite(sample.stat.mem.rss)).toBeTruthy();
    expect(sample.stat.mem.rss).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sample.cpu.secs)).toBeTruthy();
    expect(sample.cpu.secs).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sample.cpu.pct)).toBeTruthy();
    expect(sample.cpu.pct).toBeGreaterThanOrEqual(0);
  });

  it("returns sane values across repeated scans", async () => {
    const stats = ProcessStats.getInstance();
    await stats.init();

    const first = await stats.processes("process-stats-repeat");
    await delay(100);
    const second = await stats.processes("process-stats-repeat");

    expect(second.uptime).toBeGreaterThan(0);
    expect(second.boottime.getTime()).toBeGreaterThan(0);
    expect(Object.keys(second.procs).length).toBeGreaterThan(0);

    const sample = second.procs[Object.keys(second.procs)[0]];
    expect(Number.isFinite(sample.cpu.pct)).toBeTruthy();
    expect(sample.cpu.pct).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(sample.cpu.secs)).toBeTruthy();
    expect(sample.cpu.secs).toBeGreaterThanOrEqual(0);
    expect(second.uptime).toBeGreaterThanOrEqual(first.uptime - 1);
  });
});

import { createRusticProgressHandler } from "../rustic-progress";

describe("rustic progress parsing", () => {
  it("parses non-interactive progress lines", () => {
    const updates: any[] = [];
    const handler = createRusticProgressHandler({
      onProgress: (update) => updates.push(update),
      minIntervalMs: 0,
    });

    handler("[INFO] scanning files: 1.0 MiB / 4.0 MiB");
    handler("[INFO] scanning files: 4.0 MiB done in 1.2s");

    expect(updates.length).toBeGreaterThan(0);
    const first = updates[0];
    expect(first.detail.bytes_done).toBe(1 * 1024 * 1024);
    expect(first.detail.bytes_total).toBe(4 * 1024 * 1024);
    expect(first.progress).toBeCloseTo(25, 0);
    const last = updates[updates.length - 1];
    expect(last.progress).toBe(100);
  });
});

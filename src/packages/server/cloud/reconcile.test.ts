import { runReconcileOnce } from "@cocalc/server/cloud";
import { before, after, getPool } from "@cocalc/server/test";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);

afterAll(after);

beforeEach(async () => {
  await getPool().query("DELETE FROM cloud_reconcile_state");
});

describe("cloud reconcile state gating", () => {
  const provider = "gcp";

  it("skips when next_run_at is in the future", async () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const future = new Date(now.getTime() + 60_000);
    await getPool().query(
      `
        INSERT INTO cloud_reconcile_state (provider, next_run_at, updated_at)
        VALUES ($1, $2, NOW())
      `,
      [provider, future],
    );

    const reconcile = jest.fn(async () => {});
    const count = jest.fn(async () => ({ total: 0, running: 0 }));
    const result = await runReconcileOnce(provider, {
      now: () => now,
      intervals: { running_ms: 1, idle_ms: 2, empty_ms: 3 },
      reconcile,
      count,
    });

    expect(reconcile).not.toHaveBeenCalled();
    expect(result?.ran).toBe(false);
    expect(result?.skipped).toBe("not_due");
    expect(result?.next_at?.getTime()).toBe(future.getTime());
  });

  it("runs when due and updates state row", async () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const reconcile = jest.fn(async () => {});
    const count = jest.fn(async () => ({ total: 0, running: 0 }));
    const intervals = { running_ms: 10, idle_ms: 20, empty_ms: 30 };

    const result = await runReconcileOnce(provider, {
      now: () => now,
      intervals,
      reconcile,
      count,
    });

    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(result?.ran).toBe(true);

    const { rows } = await getPool().query(
      `SELECT last_run_at, next_run_at, last_error FROM cloud_reconcile_state WHERE provider=$1`,
      [provider],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.last_error).toBeNull();
    expect(new Date(row.last_run_at).getTime()).toBe(now.getTime());
    const expectedNext = now.getTime() + intervals.empty_ms;
    expect(new Date(row.next_run_at).getTime()).toBe(expectedNext);
  });

  it("returns undefined when advisory lock is held", async () => {
    const lockKey = `cloud_reconcile:${provider}`;
    const client = await getPool().connect();
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
    try {
      const reconcile = jest.fn(async () => {});
      const result = await runReconcileOnce(provider, { reconcile });
      expect(result).toBeUndefined();
      expect(reconcile).not.toHaveBeenCalled();
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      client.release();
    }
  });
});

import { uuid } from "@cocalc/util/misc";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { createTestAccount } from "./test-data";
import getMinBalance from "./get-min-balance";

beforeAll(async () => {
  await initEphemeralDatabase({});
}, 15000);

afterAll(async () => {
  await getPool().end();
});

describe("test that getMinBalance works", () => {
  const account_id = uuid();
  it("returns 0 even on an account that doesn't exist", async () => {
    expect(await getMinBalance(account_id)).toBe(0);
  });

  it("returns 0 on an account that *does* exist", async () => {
    await createTestAccount(account_id);
    expect(await getMinBalance(account_id)).toBe(0);
  });

  it("sets the min_balance field in the database and observes that getMinBalance respects the change", async () => {
    const pool = getPool();
    await pool.query("UPDATE accounts SET min_balance=$1 WHERE account_id=$2", [
      -100,
      account_id,
    ]);
    // still 0 due to cache
    expect(await getMinBalance(account_id)).toBe(0);
    // have to pass in pool to avoid cache...
    expect(await getMinBalance(account_id, pool)).toBe(-100);
  });
});

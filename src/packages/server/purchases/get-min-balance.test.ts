import { uuid } from "@cocalc/util/misc";
import { createTestAccount } from "./test-data";
import getMinBalance from "./get-min-balance";
import { before, after, getPool } from "@cocalc/server/test";
import { toDecimal } from "@cocalc/util/money";

beforeAll(async () => {
  await before({ noConat: true });
}, 15000);
afterAll(after);

describe("test that getMinBalance works", () => {
  const account_id = uuid();
  it("returns 0 even on an account that doesn't exist", async () => {
    expect(toDecimal(await getMinBalance(account_id)).toNumber()).toBe(0);
  });

  it("returns 0 on an account that *does* exist", async () => {
    await createTestAccount(account_id);
    expect(toDecimal(await getMinBalance(account_id)).toNumber()).toBe(0);
  });

  it("sets the min_balance field in the database and observes that getMinBalance respects the change", async () => {
    const pool = getPool();
    await pool.query("UPDATE accounts SET min_balance=$1 WHERE account_id=$2", [
      -100,
      account_id,
    ]);
    // still 0 due to cache
    expect(toDecimal(await getMinBalance(account_id)).toNumber()).toBe(0);
    // have to pass in pool to avoid cache...
    expect(toDecimal(await getMinBalance(account_id, pool)).toNumber()).toBe(
      -100
    );
  });
});

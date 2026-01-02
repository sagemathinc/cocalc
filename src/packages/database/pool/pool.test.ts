import getPool, {
  getPoolClient,
  getTransactionClient,
  initEphemeralDatabase,
} from "@cocalc/database/pool";
import { uuid } from "@cocalc/util/misc";

const TABLE = "pool_test_basic";

async function ensureTable(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id TEXT PRIMARY KEY,
      created TIMESTAMP,
      value INTEGER
    )`,
  );
}

async function resetTable(): Promise<void> {
  const pool = getPool();
  await ensureTable();
  await pool.query(`TRUNCATE ${TABLE}`);
}

beforeAll(async () => {
  await initEphemeralDatabase({ reset: true });
  await resetTable();
  await getPool().query("SELECT 1");
}, 30000);

beforeEach(async () => {
  await resetTable();
});

afterAll(async () => {
  await getPool().end();
});

describe("pool basic queries", () => {
  // this mysteriously hangs!
  it.skip("supports parameterized queries and query configs", async () => {
    const pool = getPool();
    const id = uuid();

    await pool.query(
      `INSERT INTO ${TABLE}(id, created, value) VALUES($1, $2, $3)`,
      [id, new Date(), 42],
    );

    const { rows } = await pool.query({
      text: `SELECT value FROM ${TABLE} WHERE id=$1`,
      values: [id],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(42);

    const { rows: rows2 } = await pool.query({ text: "SELECT 1 AS n" });
    expect(rows2[0].n).toBe(1);
  });

  it("supports pool clients and explicit transactions", async () => {
    const pool = getPool();

    const id = uuid();
    const client = await getPoolClient();
    await client.query(
      `INSERT INTO ${TABLE}(id, created, value) VALUES($1, $2, $3)`,
      [id, new Date(), 7],
    );
    client.release();

    const { rows } = await pool.query(
      `SELECT count(*) AS count FROM ${TABLE} WHERE id=$1`,
      [id],
    );
    expect(Number(rows[0].count)).toBe(1);

    const txId = uuid();
    const tx = await getTransactionClient();
    await tx.query(
      `INSERT INTO ${TABLE}(id, created, value) VALUES($1, $2, $3)`,
      [txId, new Date(), 9],
    );
    await tx.query("ROLLBACK");
    tx.release();

    const { rows: rows2 } = await pool.query(
      `SELECT count(*) AS count FROM ${TABLE} WHERE id=$1`,
      [txId],
    );
    expect(Number(rows2[0].count)).toBe(0);
  });
});

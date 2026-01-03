import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";

async function waitForChange(
  changes: { once: (event: string, cb: (change: any) => void) => void },
  timeoutMs = 10000,
): Promise<any> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timed out waiting for changefeed"));
    }, timeoutMs);
    changes.once("change", (change) => {
      clearTimeout(timer);
      resolve(change);
    });
  });
}

beforeAll(async () => {
  await initEphemeralDatabase({ reset: true });
}, 30000);

afterAll(async () => {
  await getPool().end();
});

test("changefeed emits insert and update events", async () => {
  const pool = getPool();
  await pool.query("DROP TABLE IF EXISTS changefeed_test");
  await pool.query(
    "CREATE TABLE changefeed_test (id INTEGER PRIMARY KEY, value TEXT)",
  );

  const database = db();
  const changes = await new Promise<any>((resolve, reject) => {
    database.changefeed({
      table: "changefeed_test",
      select: { id: "INTEGER" },
      watch: ["value"],
      where: { "id = $": 1 },
      cb: (err, feed) => {
        if (err) {
          reject(err);
        } else {
          resolve(feed);
        }
      },
    });
  });

  const insertWait = waitForChange(changes);
  await pool.query(
    "INSERT INTO changefeed_test(id, value) VALUES($1, $2)",
    [1, "alpha"],
  );
  const insertChange = await insertWait;
  expect(insertChange.action).toBe("insert");
  expect(insertChange.new_val).toMatchObject({ id: 1, value: "alpha" });

  const updateWait = waitForChange(changes);
  await pool.query("UPDATE changefeed_test SET value=$1 WHERE id=$2", [
    "beta",
    1,
  ]);
  const updateChange = await updateWait;
  expect(updateChange.action).toBe("update");
  expect(updateChange.new_val).toMatchObject({ id: 1, value: "beta" });

  changes.close();
});

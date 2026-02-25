import { randomUUID } from "crypto";
import { EventEmitter } from "events";

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";
import { testCleanup } from "@cocalc/database/test-utils";

let database: ReturnType<typeof db>;

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

async function waitForMatchingChange(
  changes: { once: (event: string, cb: (change: any) => void) => void },
  predicate: (change: any) => boolean,
  timeoutMs = 10000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error("timed out waiting for matching changefeed event");
    }
    const change = await waitForChange(changes, remaining);
    if (predicate(change)) {
      return change;
    }
  }
}

async function startAccountFirstNameSubscription(opts: {
  account_id: string;
  changefeed_id: string;
  client_id: string;
}): Promise<{ initial: any; changes: EventEmitter }> {
  const changes = new EventEmitter();
  return await new Promise((resolve, reject) => {
    let initialSent = false;
    database.user_query({
      account_id: opts.account_id,
      client_id: opts.client_id,
      changes: opts.changefeed_id,
      query: { accounts: [{ account_id: null, first_name: null }] },
      cb: (err, result) => {
        if (err) {
          if (!initialSent) {
            reject(err);
          } else {
            changes.emit("error", err);
          }
          return;
        }
        if (
          result != null &&
          typeof result === "object" &&
          "action" in result
        ) {
          changes.emit("change", result);
          return;
        }
        if (!initialSent) {
          initialSent = true;
          resolve({ initial: result, changes });
        }
      },
    });
  });
}

async function cancelUserQueryChangefeed(id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    database.user_query_cancel_changefeed({
      id,
      cb: (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      },
    });
  });
}

beforeAll(async () => {
  await initEphemeralDatabase({ reset: true });
  database = db();
}, 15000);

afterAll(async () => {
  await testCleanup();
});

test("changefeed emits insert and update events", async () => {
  const pool = getPool();
  await pool.query("DROP TABLE IF EXISTS changefeed_test");
  await pool.query(
    "CREATE TABLE changefeed_test (id INTEGER PRIMARY KEY, value TEXT)",
  );

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
  await pool.query("INSERT INTO changefeed_test(id, value) VALUES($1, $2)", [
    1,
    "alpha",
  ]);
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

test("account first_name changefeed updates all clients", async () => {
  const pool = getPool();
  const account_id = randomUUID();
  await pool.query(
    "INSERT INTO accounts (account_id, email_address, first_name, created) VALUES ($1, $2, $3, NOW())",
    [account_id, `${account_id}@example.com`, "Initial"],
  );

  const changefeed1 = randomUUID();
  const changefeed2 = randomUUID();
  const client1 = await startAccountFirstNameSubscription({
    account_id,
    changefeed_id: changefeed1,
    client_id: "browser-window-1",
  });
  const client2 = await startAccountFirstNameSubscription({
    account_id,
    changefeed_id: changefeed2,
    client_id: "browser-window-2",
  });

  try {
    expect(client1.initial?.accounts?.[0]?.first_name).toBe("Initial");
    expect(client2.initial?.accounts?.[0]?.first_name).toBe("Initial");

    const nextFirstName = "UpdatedFromWindowOne";
    const wait1 = waitForMatchingChange(
      client1.changes,
      (change) => change?.new_val?.first_name === nextFirstName,
      15000,
    );
    const wait2 = waitForMatchingChange(
      client2.changes,
      (change) => change?.new_val?.first_name === nextFirstName,
      15000,
    );

    await new Promise<void>((resolve, reject) => {
      database.user_query({
        account_id,
        client_id: "browser-window-1",
        query: { accounts: { account_id, first_name: nextFirstName } },
        cb: (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      });
    });

    const [change1, change2] = await Promise.all([wait1, wait2]);
    expect(change1.new_val).toMatchObject({
      account_id,
      first_name: nextFirstName,
    });
    expect(change2.new_val).toMatchObject({
      account_id,
      first_name: nextFirstName,
    });
  } finally {
    await Promise.all([
      cancelUserQueryChangefeed(changefeed1),
      cancelUserQueryChangefeed(changefeed2),
    ]);
  }
});

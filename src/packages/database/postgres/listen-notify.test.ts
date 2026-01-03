import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { db } from "@cocalc/database";

async function waitForNotification(
  database: ReturnType<typeof db>,
  channel: string,
  timeoutMs = 5000,
): Promise<any> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      database.removeListener(channel, onMessage);
      reject(new Error(`timed out waiting for ${channel}`));
    }, timeoutMs);

    function onMessage(payload: any) {
      clearTimeout(timer);
      resolve(payload);
    }

    database.once(channel, onMessage);
  });
}

beforeAll(async () => {
  await initEphemeralDatabase({ reset: true });
}, 30000);

afterAll(async () => {
  await getPool().end();
});

test("LISTEN/NOTIFY delivers JSON payloads", async () => {
  const database = db();
  const channel = `pglite_notify_${Date.now()}`;
  const payload = { ok: true, id: channel };

  await database.async_query({ query: `LISTEN ${channel}` });
  const wait = waitForNotification(database, channel);

  await getPool().query("SELECT pg_notify($1, $2)", [
    channel,
    JSON.stringify(payload),
  ]);

  const received = await wait;
  expect(received).toEqual(payload);
});

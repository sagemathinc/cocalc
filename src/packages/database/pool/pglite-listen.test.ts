import getPool, {
  getPglitePgClient,
  initEphemeralDatabase,
  isPgliteEnabled,
} from "@cocalc/database/pool";

type Notification = { channel: string; payload?: string | null };

async function waitForNotification(
  client: NodeJS.EventEmitter,
  channel: string,
  timeoutMs = 5000,
): Promise<Notification> {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.removeListener("notification", onMessage);
      reject(new Error(`timed out waiting for ${channel}`));
    }, timeoutMs);

    function onMessage(msg: Notification) {
      if (msg?.channel !== channel) {
        return;
      }
      clearTimeout(timer);
      client.removeListener("notification", onMessage);
      resolve(msg);
    }

    client.on("notification", onMessage);
  });
}

const pgliteTest = isPgliteEnabled() ? test : test.skip;

beforeAll(async () => {
  if (!isPgliteEnabled()) return;
  await initEphemeralDatabase({ reset: true });
}, 30000);

afterAll(async () => {
  if (!isPgliteEnabled()) return;
  await getPool().end();
});

pgliteTest("pglite pg client emits LISTEN notifications", async () => {
  const client = getPglitePgClient();
  const channel = `pglite_pg_client_${Date.now()}`;
  const payload = { ok: true, id: channel };

  await client.query(`LISTEN ${channel}`);
  const wait = waitForNotification(client, channel);

  await getPool().query("SELECT pg_notify($1, $2)", [
    channel,
    JSON.stringify(payload),
  ]);

  const msg = await wait;
  expect(msg.channel).toBe(channel);
  expect(JSON.parse(msg.payload ?? "null")).toEqual(payload);
  client.release();
});

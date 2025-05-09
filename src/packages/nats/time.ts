/*
Time sync -- relies on a hub running a time sync server.

To use this, call the default export, which is a sync
function that returns the current sync'd time (in ms since epoch), or
throws an error if the first time sync hasn't succeeded.
This gets initialized by default on load of your process.
If you want to await until the clock is sync'd, call "await getSkew()".

In unit testing mode this just falls back to Date.now().

DEVELOPMENT:

See src/packages/backend/nats/test/time.test.ts for relevant unit test, though
in test mode this is basically disabled.

Also do this, noting the directory and import of @cocalc/backend/nats.

~/cocalc/src/packages/backend$ node
Welcome to Node.js v18.17.1.
Type ".help" for more information.
> a = require('@cocalc/nats/time'); require('@cocalc/backend/nats')
{
  getEnv: [Getter],
  getConnection: [Function: debounced],
  init: [Function: init],
  getCreds: [AsyncFunction: getCreds]
}
> await a.default()
1741643178722.5

*/

import { timeClient } from "@cocalc/nats/service/time";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { once } from "@cocalc/util/async-utils";
import { getClient } from "@cocalc/nats/client";
import { delay } from "awaiting";

// sync clock this frequently once it has sync'd once
const INTERVAL_GOOD = 1000 * 60;
const INTERVAL_BAD = 5 * 1000;

export function init() {
  syncLoop();
}

let state = "running";
export function close() {
  state = "closed";
}

let syncLoopStarted = false;
async function syncLoop() {
  if (syncLoopStarted) {
    return;
  }
  syncLoopStarted = true;
  const client = getClient();
  while (state != "closed" && client.state != "closed") {
    try {
      await getSkew();
      if (state == "closed") return;
      await delay(INTERVAL_GOOD);
    } catch (err) {
      if (client.state != "connected") {
        await once(client, "connected");
        continue;
      }
      console.log(`WARNING: failed to sync clock -- ${err}`);
      await delay(INTERVAL_BAD);
    }
  }
}

// skew = amount in ms to subtract from our clock to get sync'd clock
export let skew: number | null = null;
let rtt: number | null = null;
export const getSkew = reuseInFlight(async (): Promise<number> => {
  if (process.env.COCALC_TEST_MODE) {
    skew = 0;
    return skew;
  }
  const start = Date.now();
  const client = getClient();
  const tc = timeClient(client);
  const serverTime = await tc.time();
  const end = Date.now();
  rtt = end - start;
  skew = start + rtt / 2 - serverTime;
  return skew;
});

export async function waitUntilTimeAvailable() {
  if (skew != null) {
    return;
  }
  await getSkew();
}

// get last measured round trip time
export function getLastPingTime(): number | null {
  return rtt;
}
export function getLastSkew(): number | null {
  return skew;
}

export default function getTime({
  noError,
}: { noError?: boolean } = {}): number {
  if (skew == null) {
    init();
    if (noError) {
      return Date.now();
    }
    throw Error("clock skew not known");
  }
  return Date.now() - skew;
}

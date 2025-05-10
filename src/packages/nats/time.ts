/*
Time sync -- relies on a hub running a time sync server.

IMPORTANT: Our realtime sync algorithm doesn't depend on an accurate clock anymore.
We may use time to compute logical timestamps for convenience, but they will always be
increasing and fall back to a non-time sequence for a while in case a clock is out of sync.
We do use the time for displaying edit times to users, which is one reason why syncing
the clock is useful.

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
import { getClient } from "@cocalc/nats/client";
import { delay } from "awaiting";
import { waitUntilConnected } from "./util";

// we use exponential backoff starting with a short interval
// then making it longer
const INTERVAL_START = 5 * 1000;
const INTERVAL_GOOD = 1000 * 120;
const TOLERANCE = 3000;

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
  let d = INTERVAL_START;
  while (state != "closed" && client.state != "closed") {
    try {
      const lastSkew = skew ?? 0;
      await getSkew();
      if (state == "closed") return;
      if (Math.abs((skew ?? 0) - lastSkew) >= TOLERANCE) {
        // changing a lot so check again soon
        d = INTERVAL_START;
      } else {
        d = Math.min(INTERVAL_GOOD, d * 2);
      }
      await delay(d);
    } catch (err) {
      console.log(`WARNING: failed to sync clock -- ${err}`);
      // reset delay
      d = INTERVAL_START;
      await delay(d);
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
  await waitUntilConnected();
  const start = Date.now();
  const client = getClient();
  const tc = timeClient(client);
  const serverTime = await tc.time();
  const end = Date.now();
  rtt = end - start;
  skew = start + rtt / 2 - serverTime;
  console.log("getSkew", { skew });
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

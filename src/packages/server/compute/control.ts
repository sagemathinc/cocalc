/*
Start a particular compute server "starting".

How this works will start simple, but is obviously going to get very complicated
over time, with multiple clouds, heuristics, api client code, etc.
*/

import { getServer } from "./get-servers";
import { setState, setError } from "./util";
import * as testCloud from "./cloud/testcloud";
import * as fluidStack from "./cloud/fluid-stack";
import * as coreWeave from "./cloud/core-weave";
import * as lambdaCloud from "./cloud/lambda-cloud";
import * as googleCloud from "./cloud/google-cloud";
import type {
  Cloud,
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { delay } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";
import { setProjectApiKey, deleteProjectApiKey } from "./project-api-key";
import getPool from "@cocalc/database/pool";

const MIN_STATE_UPDATE_INTERVAL_MS = 10 * 1000;

export async function start({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}) {
  let server = await getServer({ account_id, id });
  if (server.state != null && server.state != "off") {
    // try one more time:
    await state({ account_id, id });
    server = await getServer({ account_id, id });
    if (server.state != null && server.state != "off") {
      throw Error(
        "server must be in state 'off' (or not set) before starting it",
      );
    }
  }
  try {
    await setError(id, "");
    await setState(id, "starting");
    await setProjectApiKey({ account_id, server });
    await doStart(server);
    waitStableNoError({ account_id, id });
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
    throw err;
  }
}

async function doStart(server: ComputeServer) {
  switch (server.cloud) {
    case "test":
      return await testCloud.start(server);
    case "core-weave":
      return await coreWeave.start(server);
    case "fluid-stack":
      return await fluidStack.start(server);
    case "google-cloud":
      return await googleCloud.start(server);
    case "lambda-cloud":
      return await lambdaCloud.start(server);
    default:
      throw Error(`cloud '${server.cloud}' not currently supported`);
  }
}

export async function stop({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}) {
  const server = await getServer({ account_id, id });
  //   if (server.state != null && server.state != "running") {
  //     throw Error(
  //       "server must be in state 'running' (or null) before stopping it",
  //     );
  //   }
  try {
    await setError(id, "");
    await setState(id, "stopping");
    await deleteProjectApiKey({ account_id, server });
    await doStop(server);
    waitStableNoError({ account_id, id });
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
    throw err;
  }
}

async function doStop(server: ComputeServer) {
  switch (server.cloud) {
    case "test":
      return await testCloud.stop(server);
    case "core-weave":
      return await coreWeave.stop(server);
    case "fluid-stack":
      return await fluidStack.stop(server);
    case "google-cloud":
      return await googleCloud.stop(server);
    case "lambda-cloud":
      return await lambdaCloud.stop(server);
    default:
      throw Error(`cloud '${server.cloud}' not currently supported`);
  }
}

const lastCalled: { [id: number]: { time: number; state: State } } = {};

export const state: (opts: {
  account_id: string;
  id: number;
}) => Promise<State> = reuseInFlight(async ({ account_id, id }) => {
  const now = Date.now();
  const last = lastCalled[id];
  if (now - last?.time < MIN_STATE_UPDATE_INTERVAL_MS) {
    return last.state;
  }
  const server = await getServer({ account_id, id });
  const state = await getCloudServerState(server);
  if (state == "stopping" || state == "off") {
    // don't need it anymore.
    await deleteProjectApiKey({ account_id, server });
  }
  lastCalled[id] = { time: now, state };
  return state;
});

async function getCloudServerState(server: ComputeServer): Promise<State> {
  try {
    const state = await doState(server);
    await setState(server.id, state);
    return state;
  } catch (err) {
    await setError(server.id, `${err}`);
    await setState(server.id, "unknown");
    return "unknown";
  }
}

async function doState(server: ComputeServer): Promise<State> {
  switch (server.cloud) {
    case "test":
      return await testCloud.state(server);
    case "core-weave":
      return await coreWeave.state(server);
    case "fluid-stack":
      return await fluidStack.state(server);
    case "google-cloud":
      return await googleCloud.state(server);
    case "lambda-cloud":
      return await lambdaCloud.state(server);
    default:
      throw Error(`cloud '${server.cloud}' not currently supported`);
  }
}

async function waitStableNoError({ account_id, id }) {
  for (let i = 0; i < 2; i++) {
    // wait a little for stop to not be running before querying
    await delay(3000);
    try {
      await waitForStableState({ account_id, id, maxTime: 10 * 60 * 1000 });
    } catch (err) {
      await setError(id, `error waiting for stable state -- ${err}`);
    }
  }
}

export const waitForStableState = reuseInFlight(
  async ({
    account_id,
    id,
    maxTime = 1000 * 60 * 5,
  }: {
    account_id: string;
    id: number;
    maxTime?: number; // max time in ms
  }) => {
    let s0 = Date.now();
    const server = await getServer({ account_id, id });
    const { startDelay, maxDelay, backoff } = backoffParams(server.cloud);
    let interval = startDelay;

    while (Date.now() - s0 < maxTime) {
      const state = await getCloudServerState(server);
      if (state != "starting" && state != "stopping" && state != "unknown") {
        return state;
      }
      await delay(interval);
      interval = Math.min(interval * backoff, maxDelay);
    }
    throw Error("timeout waiting for stable state");
  },
  { createKey: (args) => `${args[0].id}` },
);

// Different clouds may have different policies about how
// frequently we should ping them for machine state information.
const BACKOFF_PARAMS = {
  default: {
    startDelay: 5000,
    maxDelay: 15000,
    backoff: 1.3,
  },
  test: {
    startDelay: 10,
    maxDelay: 150,
    backoff: 1.3,
  },
};

function backoffParams(cloud: Cloud): {
  startDelay: number;
  maxDelay: number;
  backoff: number;
} {
  return BACKOFF_PARAMS[cloud] ?? BACKOFF_PARAMS["default"];
}

// Computes and returns the upstream cost we incur in usd per hour for this compute server.
// This is often a lower bound, due to bandwidth and other hidden costs.
export async function cost({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}): Promise<number> {
  const server = await getServer({ account_id, id });
  const cost_per_hour = await doCost(server);
  const pool = getPool();
  await pool.query("UPDATE compute_servers SET cost_per_hour=$1 WHERE id=$2", [
    cost_per_hour,
    id,
  ]);
  return cost_per_hour;
}

async function doCost(server: ComputeServer) {
  switch (server.cloud) {
    case "test":
      return await testCloud.cost(server);
    case "core-weave":
      return await coreWeave.cost(server);
    case "fluid-stack":
      return await fluidStack.cost(server);
    case "google-cloud":
      return await googleCloud.cost(server);
    case "lambda-cloud":
      return await lambdaCloud.cost(server);
    default:
      throw Error(`cloud '${server.cloud}' not currently supported`);
  }
}

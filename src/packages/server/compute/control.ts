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
import type {
  Cloud,
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { delay } from "awaiting";
import { reuseInFlight } from "async-await-utils/hof";

const MIN_STATE_UPDATE_INTERVAL_MS = 10 * 1000;

export async function start({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}) {
  const server = await getServer({ account_id, id });
  if (server.state != null && server.state != "off") {
    throw Error(
      "server must be in state 'off' (or not set) before starting it",
    );
  }
  try {
    await setError(id, "");
    await setState(id, "starting");
    switch (server.cloud) {
      case "test":
        await testCloud.start(server);
        break;
      case "core-weave":
        await coreWeave.start(server);
        break;
      case "fluid-stack":
        await fluidStack.start(server);
        break;
      case "lambda-cloud":
        await lambdaCloud.start(server);
        break;
      default:
        throw Error(`cloud '${server.cloud}' not currently supported`);
    }
    // do not block on this
    (async () => {
      try {
        await waitForStableState({ account_id, id, maxTime: 10 * 60 * 1000 });
      } catch (err) {
        await setError(id, `error waiting for stable state -- ${err}`);
      }
    })();
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
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
  if (server.state != null && server.state != "running") {
    throw Error(
      "server must be in state 'running' (or null) before stopping it",
    );
  }
  try {
    await setError(id, "");
    await setState(id, "stopping");
    switch (server.cloud) {
      case "test":
        await testCloud.stop(server);
        break;
      case "core-weave":
        await coreWeave.stop(server);
        break;
      case "fluid-stack":
        await fluidStack.stop(server);
        break;
      case "lambda-cloud":
        await lambdaCloud.stop(server);
        break;
      default:
        throw Error(`cloud '${server.cloud}' not currently supported`);
    }
    // do not block on this
    (async () => {
      try {
        await waitForStableState({ account_id, id, maxTime: 10 * 60 * 1000 });
      } catch (err) {
        await setError(id, `error waiting for stable state -- ${err}`);
      }
    })();
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
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
  lastCalled[id] = { time: now, state };
  return state;
});

async function getCloudServerState(server: ComputeServer): Promise<State> {
  try {
    let state;
    switch (server.cloud) {
      case "test":
        state = await testCloud.state(server);
        break;
      case "core-weave":
        state = await coreWeave.state(server);
        break;
      case "fluid-stack":
        state = await fluidStack.state(server);
        break;
      case "lambda-cloud":
        state = await lambdaCloud.state(server);
        break;
      default:
        throw Error(`cloud '${server.cloud}' not currently supported`);
    }
    await setState(server.id, state);
    return state;
  } catch (err) {
    await setError(server.id, `${err}`);
    await setState(server.id, "unknown");
    return "unknown";
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
    startDelay: 1000,
    maxDelay: 10000,
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

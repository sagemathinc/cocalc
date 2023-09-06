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
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { delay } from "awaiting";

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
    // do not block onthis
    (async () => {
      try {
        await waitForStableState({ account_id, id, maxTime: 5 * 60 * 1000 });
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
        await waitForStableState({ account_id, id, maxTime: 5 * 60 * 1000 });
      } catch (err) {
        await setError(id, `error waiting for stable state -- ${err}`);
      }
    })();
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
  }
}

export async function state({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}): Promise<State> {
  const server = await getServer({ account_id, id });
  let state: State = "unknown";
  try {
    await setError(id, "");
    state = await getCloudServerState(server);
    await setState(id, state);
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
    throw err;
  }
  return state;
}

const lastCalled: { [id: number]: number } = {};
async function getCloudServerState(server: ComputeServer): Promise<State> {
  const now = Date.now();
  if (
    lastCalled[server.id] != null &&
    now - lastCalled[server.id] < MIN_STATE_UPDATE_INTERVAL_MS
  ) {
    throw Error(
      `call state update at most once every ${MIN_STATE_UPDATE_INTERVAL_MS} ms`,
    );
  }

  lastCalled[server.id] = now;
  switch (server.cloud) {
    case "test":
      return await testCloud.state(server);
    case "core-weave":
      return await coreWeave.state(server);
    case "fluid-stack":
      return await fluidStack.state(server);
    case "lambda-cloud":
      return await lambdaCloud.state(server);
    default:
      throw Error(`cloud '${server.cloud}' not currently supported`);
  }
}

export async function waitForStableState({
  account_id,
  id,
  maxTime = 1000 * 60 * 5,
}: {
  account_id: string;
  id: number;
  maxTime?: number; // max time in ms
}) {
  let s0 = Date.now();
  while (Date.now() - s0 < maxTime) {
    let current = await state({ account_id, id });
    if (
      current != "starting" &&
      current != "stopping" &&
      current != "unknown"
    ) {
      return;
    }
    await delay(MIN_STATE_UPDATE_INTERVAL_MS + 2000);
  }
  throw Error("timeout waiting for stable state");
}

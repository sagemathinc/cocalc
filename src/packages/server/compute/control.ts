/*
Start a particular compute server "starting".

How this works will start simple, but is obviously going to get very complicated
over time, with multiple clouds, heuristics, api client code, etc.
*/

import { getServer } from "./get-servers";
import { setState, setError } from "./util";
import * as fluidStack from "./fluid-stack";
import * as coreWeave from "./core-weave";
import * as lambdaCloud from "./lambda-cloud";

export async function start({
  account_id,
  id,
}: {
  account_id: string;
  id: number;
}) {
  const server = await getServer({ account_id, id });
  if (server.state != "off") {
    throw Error("server must be in state 'off' before starting it");
  }
  await setState(id, "starting");
  try {
    switch (server.cloud) {
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
    await setState(id, "running");
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
  if (server.state != "running") {
    throw Error("server must be in state 'running' before stopping it");
  }
  await setState(id, "stopping");
  try {
    switch (server.cloud) {
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
    await setState(id, "off");
  } catch (err) {
    await setState(id, "unknown");
    await setError(id, `${err}`);
  }
}

/*
Start, stop, etc. a particular compute server, generically, for any cloud...

How this works will start simple, but is obviously going to get very complicated
over time, with multiple clouds, heuristics, api client code, etc.

Console testing:

cd packages/server
DEBUG=cocalc:* DEBUG_CONSOLE=yes node

a = require('./dist/compute/control')

// you have to look up an account_id to use this:
await a.start({account_id:'fd9d855b-9245-473d-91a0-cdd1e69410e4', id:8})

*/

import { getServer, getServerNoCheck } from "./get-servers";
import { clearData, setState, setError } from "./util";
import * as testCloud from "./cloud/testcloud";
import * as fluidStack from "./cloud/fluid-stack";
import * as coreWeave from "./cloud/core-weave";
import * as lambdaCloud from "./cloud/lambda-cloud";
import * as googleCloud from "./cloud/google-cloud";
import * as hyperstackCloud from "./cloud/hyperstack";
import type {
  Architecture,
  Cloud,
  ComputeServer,
  Configuration,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import { getTargetState } from "@cocalc/util/db-schema/compute-servers";
import { STATE_INFO } from "@cocalc/util/db-schema/compute-servers";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { setProjectApiKey, deleteProjectApiKey } from "./project-api-key";
import getPool from "@cocalc/database/pool";
import { isEqual } from "lodash";
import updatePurchase from "./update-purchase";
import { changedKeys, setConfiguration } from "@cocalc/server/compute/util";
import { checkValidDomain } from "@cocalc/util/compute/dns";
import { hasDNS, makeDnsChange } from "./dns";
import startupScript from "@cocalc/server/compute/cloud/startup-script";
import {
  stopScript,
  deprovisionScript,
} from "@cocalc/server/compute/cloud/off-scripts";
import setDetailedState from "@cocalc/server/compute/set-detailed-state";
import isBanned from "@cocalc/server/accounts/is-banned";
import getLogger from "@cocalc/backend/logger";
import { getImages } from "@cocalc/server/compute/images";
import { defaultProxyConfig } from "@cocalc/util/compute/images";
import { ensureComputeServerHasVpnIp } from "./vpn";
import {
  unmountAll as unmountAllCloudFilesystems,
  numMounted as numMountedCloudFilesystems,
} from "@cocalc/server/compute/cloud-filesystem/control";

const logger = getLogger("server:compute:control");

//const MIN_STATE_UPDATE_INTERVAL_MS = 10 * 1000;

async function runTasks(opts, f: () => Promise<void>) {
  try {
    await f();
    await waitStableNoError(opts);
  } catch (err) {
    await setError(opts.id, `${err}`);
  } finally {
    // We always update the state no matter what after doing the above.
    // This ensures things stay in sync with the server, and
    // also DNS gets updated when the state function is called.
    await state(opts);
  }
}

export const start: (opts: {
  account_id: string;
  id: number;
}) => Promise<void> = reuseInFlight(async ({ account_id, id }) => {
  let server = await getServer({ account_id, id });
  try {
    if (await isBanned(account_id)) {
      // they should never get this far, but just in case.
      throw Error("user is banned");
    }
    await ensureComputeServerHasVpnIp(id);
    await setError(id, "");
    await setProjectApiKey({ account_id, server });
  } catch (err) {
    await setError(id, `${err}`);
    throw err;
  }
  runTasks({ account_id, id }, async () => {
    await setState(id, "starting");
    await doStart(server);
    await setState(id, "running");
    await updateLastEditedUser(id);
    await saveProvisionedConfiguration(server);
    await setDetailedState({
      project_id: server.project_id,
      id,
      name: "vm",
      state: "booting",
      timeout: 60,
      progress: 10,
    });
    updateDNS(server, "running");
  });
});

// call this to ensure that the idle timeout doesn't kill the server
// before the user even gets a chance to use it.  We always set the
// initial edited time to a few minutes in the future to allow for
// startup configuration, before user can trigger last_edited_user updates.
async function updateLastEditedUser(id: number) {
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET last_edited_user = NOW() + interval '15 minutes' WHERE id=$1",
    [id],
  );
}

async function doStart(server: ComputeServer) {
  if (server.data?.cloud != server.cloud) {
    // If you deprovision a server, then change the cloud, a stale data field
    // can result, which breaks things.  Thus we must clear it.  Also, this
    // data is something that is meaningless once a server is deprovisioned as
    // data is about provisioned state (e.g., ip address).
    delete server.data;
    await clearData({ id: server.id });
  }
  switch (server.cloud) {
    case "test":
      return await testCloud.start(server);
    case "core-weave":
      return await coreWeave.start(server);
    case "fluid-stack":
      return await fluidStack.start(server);
    case "google-cloud":
      return await googleCloud.start(server);
    case "hyperstack":
      return await hyperstackCloud.start(server);
    case "lambda":
      return await lambdaCloud.start(server);
    case "onprem":
      // no-op: user pastes a script provided on the frontend for on-prem.
      return;
    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for 'start'`,
      );
  }
}

async function saveProvisionedConfiguration({
  configuration,
  id,
}: ComputeServer) {
  const pool = getPool();
  await pool.query(
    "UPDATE compute_servers SET provisioned_configuration=$1 WHERE id=$2",
    [configuration, id],
  );
}

export const stop: (opts: { account_id: string; id: number }) => Promise<void> =
  reuseInFlight(async ({ account_id, id }) => {
    const server = await getServer({ account_id, id });
    await setError(id, "");
    runTasks({ account_id, id }, async () => {
      await setState(id, "stopping");
      if (server.configuration?.autoRestart) {
        // If we are explicitly stopping an auto-restart server, we disable auto restart,
        // so there is no chance of it being accidentally triggered.
        await setConfiguration(id, { autoRestartDisabled: true });
      }
      try {
        await deleteProjectApiKey({ account_id, server });
      } catch (err) {
        logger.debug(
          "WARNING -- unable to delete api key used by server",
          server,
          err,
        );
      }
      await doStop(server);
      await setState(id, "off");
    });
  });

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
    case "hyperstack":
      return await hyperstackCloud.stop(server);
    case "lambda":
      return await lambdaCloud.stop(server);
    case "onprem":
      // no-op: user pastes a script provided on the frontend for on-prem.
      return;
    default:
      throw Error(`cloud '${server.cloud}' not currently supported for 'stop'`);
  }
}

export const deprovision: (opts: {
  account_id: string;
  id: number;
}) => Promise<void> = reuseInFlight(async ({ account_id, id }) => {
  const server = await getServer({ account_id, id });
  await setError(id, "");

  runTasks({ account_id, id }, async () => {
    await setState(id, "stopping");
    try {
      await deleteProjectApiKey({ account_id, server });
    } catch (err) {
      // This can happen if the user is no longer a collaborator on the
      // project that contains the compute server and they run out of money,
      // so the system automatically deletes their compute server.  It's
      // bad for this to block the actual compute server delete below!
      logger.debug(
        "WARNING -- unable to delete api key used by server",
        server,
        err,
      );
    }
    await doDeprovision(server);
    await setState(id, "deprovisioned");
  });
});

async function doDeprovision(server: ComputeServer) {
  switch (server.cloud) {
    case "google-cloud":
      return await googleCloud.deprovision(server);

    case "hyperstack":
      return await hyperstackCloud.deprovision(server);

    case "onprem":
      // no-op: user pastes a script provided on the frontend for on-prem.
      return;

    case "test":
      // just a no-op
      return;

    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for 'deprovision'`,
      );
  }
}

//const lastCalled: { [id: number]: { time: number; state: State } } = {};

export const state: (opts: {
  account_id: string;
  id: number;

  // maintenance = true -- means we are getting this state as part of
  // a maintenance loop, NOT as part of a user or api initiated action.
  // An impact of this is that auto restart could be triggered.
  maintenance?: boolean;
}) => Promise<State> = reuseInFlight(
  async ({ account_id, id, maintenance }) => {
    //const now = Date.now();
    //   const last = lastCalled[id];
    //   if (now - last?.time < MIN_STATE_UPDATE_INTERVAL_MS) {
    //     return last.state;
    //   }
    const server = await getServer({ account_id, id });
    const state = await getCloudServerState(server);
    doPurchaseUpdate({ server, state });
    if (state == "deprovisioned") {
      // don't need it anymore.
      try {
        await deleteProjectApiKey({ account_id, server });
      } catch (err) {
        logger.debug(
          "WARNING -- unable to delete api key used by server",
          server,
          err,
        );
      }
    } else if (
      maintenance &&
      server.configuration?.autoRestart &&
      !server.configuration?.autoRestartDisabled &&
      state == "off"
    ) {
      // compute server got killed so launch the compute server running again.
      start({ account_id, id });
    } else if (
      server.configuration?.autoRestart &&
      server.configuration?.autoRestartDisabled &&
      state == "running"
    ) {
      // This is an auto-restart server and it's running,
      // so re-enable auto restart.
      await setConfiguration(id, { autoRestartDisabled: false });
    }
    //lastCalled[id] = { time: now, state };
    updateDNS(server, state);
    return state;
  },
);

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

// this won't throw an exception
async function updateDNS(server: ComputeServer, state: State) {
  if (
    server.configuration?.dns &&
    (state == "running" || state == "deprovisioned")
  ) {
    // We only mess with DNS when the instance is running (in which case we make sure it is properly set),
    // or the instance is deprovisioned, in which case we delete the DNS.
    // In all other cases, we just leave it alone.  It turns out if you delete the DNS record
    // whenever the machine stops, it can often take a very long time after you create the
    // record for clients to become aware of it again, which is very annoying.
    // TODO: we may want to change dns records for off machines to point to some special
    // status page (?).
    try {
      if (await hasDNS()) {
        await makeDnsChange({
          id: server.id,
          cloud: server.cloud,
          name: state == "running" ? server.configuration.dns : "",
        });
      } else {
        if (server.configuration.dns) {
          logger.debug(
            `WARNING -- not setting dns subdomain ${server.configuration.dns} because cloudflare api token and compute server dns not fully configured.  Please configure it.`,
          );
          await setError(
            server.id,
            `WARNING -- unable to set DNS since it is not fully configured by the site admins`,
          );
        }
      }
    } catch (err) {
      logger.debug("WARNING -- issue setting dns: ", err);
      await setError(server.id, `WARNING -- issue setting dns: ${err}`);
    }
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
    case "lambda":
      return await lambdaCloud.state(server);
    case "hyperstack":
      return await hyperstackCloud.state(server);
    case "onprem":
      // for onprem all state is self-reported.
      return server.state ?? "unknown";
    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for 'state'`,
      );
  }
}

async function waitStableNoError({ account_id, id }) {
  for (let i = 0; i < 2; i++) {
    // wait a little for stop to not be running before querying
    await delay(3000);
    try {
      await waitForStableState({ account_id, id, maxTime: 10 * 60 * 1000 });
      return;
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
      if (STATE_INFO[state]?.stable) {
        doPurchaseUpdate({ server, state });
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

// Computes and returns the upstream cost we incur in usd per hour for
// this compute server.  This is the fixed cost, not including network costs.
export async function cost({
  account_id,
  id,
  state,
}: {
  account_id: string;
  id: number;
  state: State;
}): Promise<number> {
  const server = await getServer({ account_id, id });
  const cost_per_hour = await computeCost({ server, state });
  // since we know the cost, let's save it so it is display
  // to user, etc.
  await getPool().query(
    "UPDATE compute_servers SET cost_per_hour=$1 WHERE id=$2",
    [cost_per_hour, id],
  );
  return cost_per_hour;
}

export async function computeCost({
  server,
  state,
}: {
  server: ComputeServer;
  state: State;
}) {
  if (state == "deprovisioned") {
    // in all cases this one is by definition easy
    return 0;
  }
  // for unstable states, we use the cost of the target stable state, because that's
  // what we get charged.  This emans the cloud cost functions below only have to handle
  // cost for stable states.
  state = getTargetState(state);

  switch (server.cloud) {
    case "test":
      return await testCloud.cost(server, state);
    case "core-weave":
      return await coreWeave.cost(server, state);
    case "fluid-stack":
      return await fluidStack.cost(server, state);
    case "google-cloud":
      return await googleCloud.cost(server, state);
    case "hyperstack":
      return await hyperstackCloud.cost(server, state);
    case "lambda":
      return await lambdaCloud.cost(server, state);
    case "onprem":
      // no-op: user pastes a script provided on the frontend for on-prem.
      return 0;
    default:
      throw Error(
        `cost for cloud '${server.cloud}' and state '${state}' not currently supported for 'cost'`,
      );
  }
}

/* Suspend and Resume */
export const suspend: (opts: {
  account_id: string;
  id: number;
}) => Promise<void> = reuseInFlight(async ({ account_id, id }) => {
  const server = await getServer({ account_id, id });
  await setError(id, "");
  runTasks({ account_id, id }, async () => {
    await setState(id, "suspending");
    await doSuspend(server, account_id);
    await setState(id, "suspended");
  });
});

async function doSuspend(server: ComputeServer, account_id: string) {
  if ((await numMountedCloudFilesystems(server.project_id)) > 0) {
    await unmountAllCloudFilesystems({ id: server.id, account_id });
  }
  switch (server.cloud) {
    case "google-cloud":
      return await googleCloud.suspend(server);
    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for 'suspend'`,
      );
  }
}

export const resume: (opts: {
  account_id: string;
  id: number;
}) => Promise<void> = reuseInFlight(async ({ account_id, id }) => {
  let server = await getServer({ account_id, id });
  await setError(id, "");

  runTasks({ account_id, id }, async () => {
    await setState(id, "starting");
    await doResume(server);
    await setState(id, "running");
  });
});

async function doResume(server: ComputeServer) {
  switch (server.cloud) {
    case "google-cloud":
      return await googleCloud.resume(server);
    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for 'resume'`,
      );
  }
}

export const reboot: (opts: {
  account_id: string;
  id: number;
}) => Promise<void> = reuseInFlight(async ({ account_id, id }) => {
  let server = await getServer({ account_id, id });
  runTasks({ account_id, id }, async () => {
    await setError(id, "");
    await setState(id, "stopping");
    await doReboot(server);
    await setState(id, "starting");
  });
});

async function doReboot(server: ComputeServer) {
  switch (server.cloud) {
    case "google-cloud":
      return await googleCloud.reboot(server);
    case "hyperstack":
      return await hyperstackCloud.reboot(server);
    case "onprem":
      // for now: just switch back to running: useful for dev at least.
      setTimeout(() => {
        setState(server.id, "running");
      }, 100);
      return;
    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for 'reboot'`,
      );
  }
}

// Throws an exception if changing from the given current
// configuration to the new one should not be allowed.
export async function validateConfigurationChange({
  cloud,
  state,
  currentConfiguration,
  changes,
}: {
  state: State;
  cloud: Cloud;
  currentConfiguration: Configuration;
  changes: Partial<Configuration>;
}) {
  const newConfiguration = { ...currentConfiguration, ...changes };
  if (newConfiguration.cloud != cloud) {
    throw Error(
      `configuration cloud "${newConfiguration.cloud}" must match compute server cloud "${cloud}"`,
    );
  }
  if (isEqual(currentConfiguration, newConfiguration)) {
    return;
  }

  const changed = changedKeys(currentConfiguration, newConfiguration);
  if (changed.has("dns")) {
    if (newConfiguration.dns) {
      // throws an error if domain isn't valid:
      checkValidDomain(newConfiguration.dns);
    }
    // changing dns is allowed in all states
    changed.delete("dns");
  }
  if (changed.size == 0) {
    // nothing to validate
    return;
  }

  if (changed.has("authToken")) {
    if (typeof newConfiguration.authToken != "string") {
      throw Error("authToken must be a string");
    }
  }

  if (changed.has("excludeFromSync")) {
    if (state == "running" || state == "suspended" || state == "suspending") {
      throw Error("cannot change excludeFromSync while server is running");
    }
    if (newConfiguration.excludeFromSync != null) {
      if (typeof newConfiguration.excludeFromSync != "object") {
        throw Error("excludeFromSync must be an array");
      }
      for (const path of newConfiguration.excludeFromSync) {
        if (typeof path != "string") {
          throw Error("excludeFromSync must be an array of strings");
        }
        if (!path) {
          throw Error("path must not be trivial");
        }
        if (path.includes("/")) {
          throw Error("directories must not include '/'");
        }
        if (path.includes("|")) {
          throw Error("directories may not include '|'");
        }
      }
    }
  }

  switch (cloud) {
    case "google-cloud":
      await googleCloud.validateConfigurationChange({
        state,
        // @ts-ignore
        currentConfiguration,
        // @ts-ignore
        newConfiguration,
      });
      return;
  }
}

export async function makeConfigurationChange({
  id,
  cloud,
  state,
  currentConfiguration,
  changes,
}: {
  id: number;
  state: State;
  cloud: Cloud;
  currentConfiguration: Configuration;
  changes: Partial<Configuration>;
}) {
  if (state == "deprovisioned") {
    return;
  }

  const newConfiguration = { ...currentConfiguration, ...changes };
  if (isEqual(currentConfiguration, newConfiguration)) {
    return;
  }

  const changed = changedKeys(currentConfiguration, newConfiguration);
  logger.debug("makeConfigurationChange", {
    id,
    cloud,
    state,
    currentConfiguration,
    newConfiguration,
    changes,
    changed,
    keys: Object.keys(changed),
  });
  if (changed.has("dns")) {
    if (state == "running" || !newConfiguration.dns) {
      // if running or removing dns, better update it.
      if (await hasDNS()) {
        // .. but only if DNS is actually configured and enabled (otherwise, there is nothing that we can do, and
        // the frontend client is not honoring our published config, or config is incomplete).
        // TODO: maybe we should just throw an error in this case?
        await makeDnsChange({
          id,
          previousName: currentConfiguration.dns,
          name: newConfiguration.dns,
          cloud: newConfiguration.cloud,
        });
      }
    }
    changed.delete("dns");
  }
  if (changed.has("authToken")) {
    // this is handled directly by the client right now
    // TODO: we might change to do it here instead at some point.
    changed.delete("authToken");
  }
  if (changed.has("proxy")) {
    // same comment as for authToken
    changed.delete("proxy");
  }
  if (changed.has("ephemeral")) {
    // always safe to change this -- no heck required and no impact on actual deployment
    changed.delete("ephemeral");
  }
  if (changed.has("excludeFromSync") && state == "off") {
    changed.delete("excludeFromSync");
  }
  if (changed.size == 0) {
    // nothing else to change
    return;
  }

  switch (cloud) {
    case "google-cloud":
      return await googleCloud.makeConfigurationChange({
        id,
        state,
        // @ts-ignore
        currentConfiguration,
        // @ts-ignore
        newConfiguration,
      });
    case "hyperstack":
      return await hyperstackCloud.makeConfigurationChange({
        id,
        state,
        // @ts-ignore
        currentConfiguration,
        // @ts-ignore
        newConfiguration,
      });
    default:
      throw Error(
        `makeConfigurationChange not implemented for cloud '${cloud}' changing value of ${JSON.stringify(
          Array.from(changed),
        )}`,
      );
  }
}

async function doPurchaseUpdate({ server, state }) {
  try {
    await updatePurchase({ server, newState: state });
  } catch (err) {
    logger.debug(
      "error updating purchase in response to a state change -- ",
      `${err}`,
      { server_id: server.id },
    );
  }
}

export async function getNetworkUsage(opts: {
  server: ComputeServer;
  start: Date;
  end: Date;
}): Promise<{ amount: number; cost: number }> {
  switch (opts.server.cloud) {
    case "google-cloud":
      return await googleCloud.getNetworkUsage(opts);
    case "hyperstack":
    case "lambda":
      // hyperstack and lambda do not charge for or meter
      // network usage at all.
      return { amount: 0, cost: 0 };
    case "onprem":
      // TODO: network usage currently free for on prem. This will change
      // since we should charge for data transfer out from the project to the on prem node!
      return { amount: 0, cost: 0 };
    case "test":
      return testNetworkUsage[opts.server.id] ?? { amount: 0, cost: 0 };
    default:
      throw Error(
        `cloud '${opts.server.cloud}' network usage not currently implemented`,
      );
  }
}

export function hasNetworkUsage(cloud: Cloud): boolean {
  return cloud == "google-cloud" || cloud == "test";
}

// Used for unit testing only.
const testNetworkUsage: { [id: number]: { amount: number; cost: number } } = {};
export async function setTestNetworkUsage({
  id,
  amount,
  cost,
}: {
  id: number;
  amount: number;
  cost: number;
}) {
  testNetworkUsage[id] = { amount, cost };
}

export async function getStartupParams(id: number): Promise<{
  cloud: Cloud;
  project_id: string;
  project_specific_id: number;
  gpu?: boolean;
  arch: Architecture;
  image: string;
  exclude_from_sync: string;
  auth_token: string;
  proxy;
}> {
  const server = await getServerNoCheck(id);
  const { configuration } = server;
  const excludeFromSync = server.configuration?.excludeFromSync ?? [];
  const auth_token = server.configuration?.authToken ?? "";
  const image = configuration.image ?? "python";
  const proxy =
    server.configuration?.proxy ??
    defaultProxyConfig({ IMAGES: await getImages(), image });
  const exclude_from_sync = excludeFromSync.join("|");

  let x;
  switch (server.cloud) {
    case "google-cloud":
      x = {
        ...(await googleCloud.getStartupParams(server)),
        image,
        exclude_from_sync,
        auth_token,
        proxy,
      };
      break;
    case "onprem":
      if (configuration.cloud != "onprem") {
        throw Error("inconsistent configuration -- must be onprem");
      }
      x = {
        project_id: server.project_id,
        gpu: !!configuration.gpu,
        arch: configuration.arch ?? "x86_64",
        image,
        exclude_from_sync,
        auth_token,
        proxy,
      };
      break;
    case "hyperstack":
      if (configuration.cloud != "hyperstack") {
        throw Error("inconsistent configuration -- must be hyperstack");
      }
      x = {
        ...(await hyperstackCloud.getStartupParams(server)),
        project_id: server.project_id,
        arch: "x86_64",
        image,
        exclude_from_sync,
        auth_token,
        proxy,
      };
      break;
    default:
      throw Error(
        `getStartupParams for '${server.cloud}' not currently implemented`,
      );
  }
  return {
    cloud: server.cloud,
    project_specific_id: server.project_specific_id,
    tag: configuration.tag,
    tag_cocalc: configuration.tag_cocalc,
    tag_filesystem: configuration.tag_filesystem,
    ...x,
  };
}

async function getHostname(project_specific_id: number): Promise<string> {
  // we might make this more customizable
  return `compute-server-${project_specific_id}`;
}

export async function getStartupScript({
  id,
  api_key,
  installUser,
}: {
  id;
  api_key;
  installUser?;
}): Promise<string> {
  const params = await getStartupParams(id);
  return await startupScript({
    compute_server_id: id,
    api_key,
    hostname: await getHostname(params.project_specific_id),
    installUser,
    ...params,
  });
}

export async function getStopScript({
  id,
  api_key,
}: {
  id;
  api_key;
}): Promise<string> {
  return await stopScript({
    compute_server_id: id,
    api_key,
  });
}

export async function getDeprovisionScript({
  id,
  api_key,
}: {
  id;
  api_key;
}): Promise<string> {
  return await deprovisionScript({
    compute_server_id: id,
    api_key,
  });
}

// Set the tested status of the image that the given server is using.
// This is currently only meaningful on Google cloud.
// This is something that only admins should use.
export async function setImageTested(opts: {
  id: number;
  account_id: string;
  tested: boolean;
}) {
  const server = await getServer(opts);
  switch (server.cloud) {
    case "google-cloud":
      await googleCloud.setImageTested(server, opts.tested);
      return;
    default:
      throw Error(
        `cloud '${server.cloud}' not currently supported for setting image tested`,
      );
  }
}

export async function getSerialPortOutput({ account_id, id }): Promise<string> {
  const server = await getServer({ account_id, id });
  switch (server.cloud) {
    case "google-cloud":
      return await googleCloud.getSerialPortOutput(server);
    default:
      throw Error(
        `serial port output not implemented on cloud '${server.cloud}'`,
      );
  }
}

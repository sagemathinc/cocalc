import type {
  ComputeServer,
  State,
  HyperstackData,
  Data,
} from "@cocalc/util/db-schema/compute-servers";
import type { Region } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { DEFAULT_DISK } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import getLogger from "@cocalc/backend/logger";
import getPricingData from "./pricing-data";
import computeCost, {
  BOOT_DISK_SIZE_GB,
} from "@cocalc/util/compute/cloud/hyperstack/compute-cost";
import {
  createVolume,
  createEnvironment,
  createVirtualMachines,
  deleteVirtualMachine,
  deleteVolume,
  getEnvironments,
  getKeyPairs,
  getVirtualMachine,
  hardRebootVirtualMachine,
  importKeyPair,
  startVirtualMachine,
} from "./client";
import { setData as setData0 } from "@cocalc/server/compute/util";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { delay } from "awaiting";
export * from "./make-configuration-change";
import { initDatabaseCache } from "./client-cache";
import {
  getServerName,
  getDiskName,
  environmentName,
  keyPairName,
} from "./names";
import { attachVolumes, increaseDiskSize } from "./disk";
import { cloudInitScript } from "@cocalc/server/compute/cloud/startup-script";
import { hasGPU } from "@cocalc/util/compute/cloud/hyperstack/flavor";

const logger = getLogger("server:compute:hyperstack");

initDatabaseCache();

// TODO: This 29 comes from the following -- it should be computed dynamically
// probably once per server start (?).
// > i = await getImages()  // from client
// i[5]  <-- id=29 is the one "Ubuntu Server 22.04 LTS R535 CUDA 12.2"
const BOOT_IMAGE_ID = { "CANADA-1": 29, "NORWAY-1": 33 };

// by default we open up tcp for ports 22, 80 and 443 (ssh and webserver)
const SECURITY_RULES = [
  { port_range_min: 22, port_range_max: 22 },
  { port_range_min: 80, port_range_max: 80 },
  { port_range_min: 443, port_range_max: 443 },
];

export async function setData({ id, data }) {
  if (data.vm != null) {
    data = { ...data, externalIp: data.vm.floating_ip };
  } else if (data.vm === null) {
    data = { ...data, externalIp: "" };
  }
  await setData0({
    cloud: "hyperstack",
    id,
    data,
  });
}

function getHyperstackData(server: ComputeServer): HyperstackData {
  const data: Data | undefined = server.data;
  if (data == null) {
    return { cloud: "hyperstack" };
  }
  if (data.cloud != "hyperstack") {
    throw Error(
      "state: data defined by data.cloud isn't hyperstack -- stale data?",
    );
  }
  return data;
}

export async function getPublicSSHKey() {
  const { hyperstack_ssh_public_key = "" } = await getServerSettings();
  return hyperstack_ssh_public_key;
}

export async function ensureKeyPair(
  region_name: Region,
  environment_name: string,
): Promise<string> {
  const name = await keyPairName(region_name);
  const keyPairs = await getKeyPairs();
  for (const keyPair of keyPairs) {
    if (name == keyPair.name) {
      return name;
    }
  }
  await importKeyPair({
    name,
    environment_name,
    public_key: await getPublicSSHKey(),
  });
  return name;
}

export async function ensureEnvironment(region_name: Region): Promise<string> {
  const name = await environmentName(region_name);
  const v = await getEnvironments();
  for (const env of v) {
    if (name == env.name) {
      return name;
    }
  }
  await createEnvironment({
    name,
    region: region_name,
  });
  return name;
}

// these are the servers that are currently starting.
const starting = new Set<number>();

export async function start(server: ComputeServer) {
  if (starting.has(server.id)) {
    return;
  }
  try {
    starting.add(server.id);
    logger.debug("start", server);
    if (server.configuration?.cloud != "hyperstack") {
      throw Error("must have a hyperstack configuration");
    }
    const data = getHyperstackData(server);
    // If the disk doesn't exist, create it.
    const disks = data.disks ?? [];
    let environment_name: null | string = null;
    if (disks.length == 0) {
      logger.debug("start: creating boot disk");
      environment_name = await ensureEnvironment(
        server.configuration.region_name,
      );
      // ATTN: could have disk get created by setData below fails (e.g., our database is down),
      // and then we just have a wasted disk floating around.  This illustrates the importance
      // of periodic garbage collection.
      // Unfortunately, this takes a LONG time.
      const volume = await createVolume({
        name: await getDiskName(server, 0),
        size: BOOT_DISK_SIZE_GB,
        environment_name,
        image_id: BOOT_IMAGE_ID[server.configuration.region_name],
      });
      disks.push(volume.id);
      await setData({
        id: server.id,
        data: { disks },
      });
    }
    // [ ] TODO: we need to check that total size of existing disks equals diskSizeGb

    //
    if (disks.length == 1) {
      // TODO: **always** need to ensure there are at least two disks -- the boot disk and the user data disk
      environment_name = await ensureEnvironment(
        server.configuration.region_name,
      );
      // ATTN: could have disk get created by setData below fails (e.g., our database is down),
      // and then we just have a wasted disk floating around.  This illustrates the importance
      // of periodic garbage collection.
      const volume = await createVolume({
        name: await getDiskName(server, 1),
        size: server.configuration.diskSizeGb ?? DEFAULT_DISK,
        environment_name,
      });
      disks.push(volume.id);
      await setData({
        id: server.id,
        data: { disks },
      });
    } else {
      // might be necessary to enlarge the disk (which means "add a new disk if possible")
      await increaseDiskSize({
        id: server.id,
        configuration: server.configuration,
        state: "starting",
      });
    }
    let externalIp = data.externalIp;
    if (!data.vm?.id) {
      logger.debug("start: no existing VM, so create one");
      // [vm] since returns a LIST of vm's
      if (!environment_name) {
        environment_name = await ensureEnvironment(
          server.configuration.region_name,
        );
      }
      let vm;
      const t0 = Date.now();
      let d = 3000;
      // wait up to 30 minutes until the boot volume exists (we get an error)
      // trying to create the VM until it exists.  This is VERY SLOW for the
      // norway data center, but much faster for canada-1.
      const volume_name = await getDiskName(server, 0);
      while (Date.now() - t0 <= 1000 * 60 * 30) {
        try {
          [vm] = await createVirtualMachines({
            name: await getServerName(server),
            environment_name,
            volume_name,
            key_name: await ensureKeyPair(
              server.configuration.region_name,
              environment_name,
            ),
            assign_floating_ip: true,
            flavor_name: server.configuration.flavor_name,
            security_rules: SECURITY_RULES,
            user_data: await cloudInitScript({
              compute_server_id: server.id,
              api_key: server.api_key,
            }),
          });
          break;
        } catch (err) {
          if (err.message.includes(`Volume ${volume_name} does not exist`)) {
            d = Math.min(10000, d * 1.3);
            await delay(d);
          } else {
            throw err;
          }
        }
      }
      externalIp = vm?.floating_ip;
      data.vm = vm;
      await setData({
        id: server.id,
        data: { vm },
      });
      if (disks.length > 1) {
        logger.debug(`start: attach the other ${disks.length} disks`);
        // this is painful since you can't attach disks until the VM is getting going sufficiently.
        await attachVolumes({ vm_id: vm.id, volume_ids: disks.slice(1) });
      }
    } else {
      logger.debug("start: using existing VM with id", data.vm.id);
      // todo: what happens if vm already running or starting?
      await startVirtualMachine(data.vm.id);
    }
    if (!externalIp && data.vm?.id != null) {
      await waitForIp(data.vm.id, server.id);
    }
  } finally {
    starting.delete(server.id);
  }
}

async function waitForIp(
  vm_id: number,
  server_id: number,
  maxTime = 10 * 60 * 1000,
) {
  // finally ensure we have ip address -- should not take long at a
  let d = 5000;
  while (d < maxTime) {
    const vm = await getVirtualMachine(vm_id);
    const externalIp = vm?.floating_ip;
    logger.debug("waitForIp: waiting for ip address: got", externalIp);
    if (externalIp) {
      await setData({
        id: server_id,
        data: { vm },
      });
      return;
    }
    d = Math.min(30000, d * 1.3);
    await delay(d);
  }
  throw Error(`failed to get ip address for vm with id ${vm_id}`);
}

const stopping = new Set<number>();

export async function stop(server: ComputeServer) {
  if (stopping.has(server.id)) {
    return;
  }
  try {
    stopping.add(server.id);
    logger.debug("stop", server);
    if (server.configuration?.cloud != "hyperstack") {
      throw Error("must have a hyperstack configuration");
    }
    const data = getHyperstackData(server);
    if (data.vm?.id) {
      logger.debug("stop: deleting vm... ", data.vm.id);
      await deleteVirtualMachine(data.vm.id);
      logger.debug("stop: deleted vm... ", data.vm.id);
      await setData({
        id: server.id,
        data: { vm: null, externalIp: null },
      });
    }
  } finally {
    stopping.delete(server.id);
  }
}

export async function reboot(server: ComputeServer) {
  if (stopping.has(server.id) || starting.has(server.id)) {
    return;
  }
  logger.debug("reboot", server);
  if (server.configuration?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  const data = getHyperstackData(server);
  if (data.vm?.id) {
    logger.debug("reboot", data.vm.id);
    await hardRebootVirtualMachine(data.vm.id);
  }
}

export async function deprovision(server: ComputeServer) {
  if (stopping.has(server.id) || starting.has(server.id)) {
    return;
  }
  logger.debug("deprovision", server);
  const conf = server.configuration;
  if (conf?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  // Delete the VM = stop
  await stop(server);
  // Then delete all of the disks:
  const data = getHyperstackData(server);
  const disks = data.disks ?? [];
  for (const id of disks) {
    const t0 = Date.now();
    let d = 5000;
    while (Date.now() - t0 <= 1000 * 60 * 15) {
      // give up after 15 min...?
      try {
        await deleteVolume(id);
        logger.debug("deprovision: successfully deleted volume ", id);
        break;
      } catch (err) {
        logger.debug("deprovision: have to keep trying to delete volume", err);
        d = Math.min(15000, d * 1.3);
        await delay(d);
      }
    }
  }
  await setData({
    id: server.id,
    data: { disks: null },
  });
}

export async function state(server: ComputeServer): Promise<State> {
  logger.debug("state", server);
  const conf = server.configuration;
  if (conf?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  if (starting.has(server.id)) {
    return "starting";
  }
  if (stopping.has(server.id)) {
    return "stopping";
  }
  let data;
  try {
    data = getHyperstackData(server);
  } catch (err) {
    logger.debug("state: WARNING data is wrong for server -- ", err);
    return "deprovisioned";
  }
  if (data == null) {
    return "deprovisioned";
  }
  if (!data.vm?.id) {
    logger.debug("state: no VM", { data });
    // definitely no known VM resource, so not running or starting.
    // It is either deprovisioned or off.
    const disks = data.disks ?? [];
    logger.debug("state: disks=", disks);
    if (disks.length == 0) {
      // definitely deprovisioned
      return "deprovisioned";
    }
    // there are disk id's.  Our plan is to just assume our database is correct, i.e.,
    // if we have id's, then the disks exist.  We will then periodically do getVolumes()
    // and sync the volumes Hyperstack thinks we have with what we think we have.
    // The ONLY api call hyperstack has is "get all volumes" with no paging, i.e., their
    // api does NOT scale.  Hopefully it will in a year (?).
    return "off";
  }
  // our database thinks a vm resource exists.
  let vm;
  try {
    vm = await getVirtualMachine(data.vm.id);
  } catch (err) {
    // fail if (1) the api isn't working or is down, OR (2) the VM doesn't exist at all, e.g.,
    // because we deleted it (e.g., our version of "stop").
    // Fortunately the error is pretty clear and structured when VM doesn't exist:
    if (err.message.includes("not_found")) {
      // delete id from database since it is not valid:
      try {
        logger.debug("state: clearing data.vm");
        await setData({
          id: server.id,
          data: { vm: null, externalIp: null },
        });
      } catch (err2) {
        logger.debug(
          "WARNING -- failed to set server data ",
          { id: server.id },
          err2,
        );
      }
      // and the state is definitely 'off'
      return "off";
    }
    // error calling the api -- maybe the network or the api is down.
    throw err;
  }
  logger.debug("state: got vm", vm);
  await setData({
    id: server.id,
    data: { vm },
  });

  // If any state/status is "ERROR", then we delete the VM,
  // clear data, and return 'off'.  Randomly sometimes VM's break
  // and get into an error state -- this is a BUG in Hyperstack
  // and should never happen, but it does.  At least with this
  // check it's likely things can recover and the user of cocalc
  // doesn't get blocked out.
  if (
    vm.status?.toLowerCase() == "error" ||
    (vm.power_state?.toLowerCase() == "error" &&
      vm.vm_state?.toLowerCase() == "error")
  ) {
    await deleteVirtualMachine(data.vm.id);
    await setData({
      id: server.id,
      data: { vm: null, externalIp: null },
    });
    return "off";
  }

  if (
    vm.status == "ACTIVE" &&
    vm.power_state == "RUNNING" &&
    vm.vm_state == "active"
  ) {
    return "running";
  }
  // TODO: how to tell between starting and stopping?
  // -- fortunately, stopping
  // is VERY quick; it's basically just delete.  Also, note that we
  // have the starting/stopping sets in memory, though that won't help
  // when there are multiple servers!
  // TODO: may will instead use the database cache.
  return "starting";
}

export async function cost(
  server: ComputeServer,
  state: State,
): Promise<number> {
  logger.debug("cost", server);
  const { configuration } = server;
  if (configuration?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  if (state == "deprovisioned") {
    return 0;
  }
  const priceData = await getPricingData();
  // we  need to handle the stable target states except 'deprovisioned'
  switch (state) {
    case "off":
    case "running":
    case "suspended":
      return computeCost({ priceData, configuration, state });
    default:
      throw Error(`cost computation for state '${state}' not implemented`);
  }
}

export function getStartupParams(server: ComputeServer) {
  const { configuration } = server;
  if (configuration?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  return {
    gpu: hasGPU(configuration.flavor_name),
  };
}

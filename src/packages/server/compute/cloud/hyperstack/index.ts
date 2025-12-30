import type {
  ComputeServer,
  State,
  HyperstackData,
  Data,
} from "@cocalc/util/db-schema/compute-servers";
import type {
  Protocol,
  Region,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { DEFAULT_DISK } from "@cocalc/util/compute/cloud/hyperstack/api-types";
import getLogger from "@cocalc/backend/logger";
import getPricingData from "./pricing-data";
import computeCost from "@cocalc/util/compute/cloud/hyperstack/compute-cost"; //  BOOT_DISK_SIZE_GB,
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
  getImages,
} from "./client";
import { setData as setData0 } from "@cocalc/server/compute/util";
import { getControlPlaneSshKeypair } from "../../../cloud/ssh-key";
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
import {
  hasGPU,
  hasLocalSSD,
} from "@cocalc/util/compute/cloud/hyperstack/flavor";
import { createTTLCache } from "@cocalc/server/compute/database-cache";

const logger = getLogger("server:compute:hyperstack");

initDatabaseCache();

export async function getImageName(region_name: string): Promise<string> {
  const images = await getImages();
  const ubuntu = images.filter(
    (x) => x.region_name == region_name && x.type == "Ubuntu",
  )[0].images;
  const cuda = ubuntu.filter(
    (x) => x.version.includes("CUDA") && x.version.includes("22.04"),
  )[0];
  // as of writing this is always "Ubuntu Server 22.04 LTS R535 CUDA 12.2"
  // but I could imagine it randomly changing...
  return cuda.name;
}

// by default we open up tcp for ports 22, 80 and 443 (ssh and webserver),
// and udp port 51820 for wireguard vpn.
const SECURITY_RULES = [
  { port_range_min: 22, port_range_max: 22, protocol: "tcp" as Protocol }, // ssh
  { port_range_min: 80, port_range_max: 80, protocol: "tcp" as Protocol }, // http
  { port_range_min: 443, port_range_max: 443, protocol: "tcp" as Protocol }, // https
  { port_range_min: 51820, port_range_max: 51820, protocol: "udp" as Protocol }, // wireguard
];

export async function setData({ id, data }) {
  if (data.vm != null) {
    data = {
      ...data,
      externalIp: data.vm.floating_ip,
      internalIp: data.vm.fixed_ip,
    };
  } else if (data.vm === null) {
    data = { ...data, externalIp: "", internalIp: "" };
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
    public_key: (await getControlPlaneSshKeypair()).publicKey,
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

// Just in case the server is killed and the finally doesn't happen in
// start/stop, this timeout ensures we give up the starting/stoping lock
// after this long.  During starting/stopping we should periodically update the
// local more quickly than this.
const CACHE_TIME_M = 1;
const stateCache = createTTLCache({
  ttl: CACHE_TIME_M * 60 * 1000,
  cloud: "hyperstack",
  prefix: "state",
});

// NOTE: In reading start, you might wonder what happens if the nodejs process
// is killed while the VM is being created but before the external disks are
// attached.  This case *is* dealt with when state is called, where things get
// properly turned off.
export async function start(server: ComputeServer) {
  const s = await stateCache.get(server.id);
  if (s == "starting" || s == "stopping") {
    return;
  }
  try {
    await stateCache.set(server.id, "starting");
    logger.debug("start", server);
    if (server.configuration?.cloud != "hyperstack") {
      throw Error("must have a hyperstack configuration");
    }
    const data = getHyperstackData(server);
    // If the disk doesn't exist, create it.
    const disks = data.disks ?? [];
    let environment_name: null | string = null;
    //     if (disks.length == 0) {
    //       logger.debug("start: creating boot disk");
    //       environment_name = await ensureEnvironment(
    //         server.configuration.region_name,
    //       );
    //       // ATTN: could have disk get created by setData below fails (e.g., our database is down),
    //       // and then we just have a wasted disk floating around.  This illustrates the importance
    //       // of periodic garbage collection.
    //       // Unfortunately, this takes a LONG time.
    //       const volume = await createVolume({
    //         name: await getDiskName(server, 0),
    //         size: BOOT_DISK_SIZE_GB,
    //         environment_name,
    //         image_id: BOOT_IMAGE_ID[server.configuration.region_name],
    //       });
    //       disks.push(volume.id);
    //       await setData({
    //         id: server.id,
    //         data: { disks },
    //       });
    //     }
    if (disks.length == 0) {
      // TODO: **always** need to ensure there are at least one disk -- the user data disk
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
    const starting = async () => await stateCache.set(server.id, "starting");
    if (!data.vm?.id) {
      logger.debug("start: no existing VM, so create one");
      // [vm] since returns a LIST of vm's
      if (!environment_name) {
        environment_name = await ensureEnvironment(
          server.configuration.region_name,
        );
      }

      await starting();
      const [vm] = await createVirtualMachines({
        name: await getServerName(server),
        environment_name,
        image_name: await getImageName(server.configuration.region_name),
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
          local_ssd: hasLocalSSD(server.configuration, await getPricingData())
            ? "/dev/vdb"
            : "",
        }),
      });
      externalIp = vm?.floating_ip;
      data.vm = vm;
      await setData({
        id: server.id,
        data: { vm },
      });
      if (disks.length > 0) {
        logger.debug(`start: attach the other ${disks.length} disks`);
        // this is painful since you can't attach disks until the VM is getting going sufficiently.
        await attachVolumes({
          vm_id: vm.id,
          volume_ids: disks,
          f: starting,
        });
      }
    } else {
      logger.debug("start: using existing VM with id", data.vm.id);
      // todo: what happens if vm already running or starting?
      await startVirtualMachine(data.vm.id);
    }
    if (!externalIp && data.vm?.id != null) {
      await waitForIp(data.vm.id, server.id, 10 * 60 * 1000, starting);
    }
  } finally {
    await stateCache.delete(server.id);
  }
}

async function waitForIp(
  vm_id: number,
  server_id: number,
  maxTime: number,
  f?: Function,
) {
  // finally ensure we have ip address -- should not take long at a
  let d = 3000;
  const end = Date.now() + maxTime;
  while (Date.now() < end) {
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
    await f?.();
    await delay(d);
  }
  throw Error(`failed to get ip address for vm with id ${vm_id}`);
}

export async function stop(server: ComputeServer) {
  const s = await stateCache.get(server.id);
  if (s == "starting" || s == "stopping") {
    return;
  }
  try {
    await stateCache.set(server.id, "stopping");
    logger.debug("stop", server);
    if (server.configuration?.cloud != "hyperstack") {
      throw Error("must have a hyperstack configuration");
    }
    const data = getHyperstackData(server);
    if (data.vm?.id) {
      logger.debug("stop: deleting vm... ", data.vm.id);
      await deleteVirtualMachine(data.vm.id);
      logger.debug("stop: wait to delete vm... ", data.vm.id);
      await waitUntilDeleted(
        data.vm.id,
        10 * 60 * 1000,
        async () => await stateCache.set(server.id, "stopping"),
      );
      logger.debug("stop: deleted vm... ", data.vm.id);
      await setData({
        id: server.id,
        data: { vm: null, externalIp: null },
      });
    }
  } finally {
    stateCache.delete(server.id);
  }
}

async function waitUntilDeleted(vm_id: number, maxTime: number, f?: Function) {
  let d = 3000;
  const end = Date.now() + maxTime;
  while (Date.now() < end) {
    let vm;
    logger.debug("waitUntilDeleted: ", vm_id, { now: Date.now(), end });
    try {
      vm = await getVirtualMachine(vm_id);
    } catch (_err) {
      // get an error if the VM is gone, which is good!
      // (could also get an error if network or api is down -- however then probably best to
      // just return as well)
      logger.debug(`waitUntilDeleted: error so done `, vm_id);
      return;
    }
    if (vm.status == "DELETING") {
      d = Math.min(15000, d * 1.3);
      logger.debug(`waitUntilDeleted: waiting ${d}ms... `, vm_id);
      await f?.();
      await delay(d);
    } else {
      logger.debug(`waitUntilDeleted: done `, vm_id);
      return;
    }
  }
  throw Error(`failed to wait for vm id ${vm_id} to get deleted`);
}

export async function reboot(server: ComputeServer) {
  const s = await stateCache.get(server.id);
  if (s == "starting" || s == "stopping") {
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
  const s = await stateCache.get(server.id);
  if (s == "starting" || s == "stopping") {
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
    while (Date.now() - t0 <= 1000 * 60 * 3) {
      // give up after a few min.  Note that garbage
      // collection will also accomplish this if it fails here.
      // It justs costs us slightly more and temporarily causes
      // issues with starting the VM.
      try {
        await deleteVolume(id);
        logger.debug(`deprovision: successfully deleted volume ${id}`);
        break;
      } catch (err) {
        if (err.message.includes("not_found")) {
          logger.debug(`deprovision: volume ${id} already deleted`);
          break;
        }
        logger.debug(
          `deprovision: will keep trying to delete volume id=${id} -- ${err}`,
        );
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
  const s = await stateCache.get(server.id);
  if (s != null) {
    return s;
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
  // Also if the volume_attachments length is at most 1, then something
  // must have gone wrong during starting/creating of the VM (i.e.,
  // the start function above), e.g., maybe the nodejs process got killed
  // while waiting to attach the disk.  In this hopefully extremely rare
  // case, we also just turn the VM off. The user can then start it again.
  if (
    vm.status?.toLowerCase() == "error" ||
    vm.power_state?.toLowerCase() == "error" ||
    vm.vm_state?.toLowerCase() == "error" ||
    (vm.volume_attachments?.length ?? 0) <= 0
  ) {
    logger.debug("state: incomplete VM -- deleting", vm);
    await deleteVirtualMachine(data.vm.id);
    await waitUntilDeleted(data.vm.id, 2 * 60 * 1000);
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

  if (vm.status == "CREATING" || vm.status == "REBOOTING") {
    return "starting";
  }
  if (vm.status == "DELETING") {
    // we delete the VM to "stop" it.
    return "stopping";
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

export async function getStartupParams(server: ComputeServer) {
  const { configuration } = server;
  if (configuration?.cloud != "hyperstack") {
    throw Error("must have a hyperstack configuration");
  }
  const priceData = await getPricingData();
  return {
    gpu: hasGPU(configuration, priceData),
    local_ssd: hasLocalSSD(configuration, priceData) ? "/dev/vdb" : "",
  };
}

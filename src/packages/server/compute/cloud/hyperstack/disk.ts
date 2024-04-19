/*
Disks are tricky right now with hyperstack, because they do not support
volume enlarge.

I talked to their CTO and they say it won't be hard to add, but we have to
work with what we have today.

NOTE: with "zpool remove tank /dev/vd?" we can very easily shrink and remove
in each increment that was added, with just having to wait for some data to
copy.  This is pretty cool and would work in general, so maybe we stick with
this approach?
*/

import type {
  HyperstackConfiguration,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import {
  attachVolume as attachVolume0,
  createVolume,
  getVolumes,
} from "./client";
import { getServerName, getDiskName } from "./names";
import { getData } from "@cocalc/server/compute/util";
import {
  MAX_DISKS,
  DEFAULT_DISK,
} from "@cocalc/util/compute/cloud/hyperstack/api-types";
import { ensureEnvironment, setData } from "./index";
import getLogger from "@cocalc/backend/logger";
import { delay } from "awaiting";

const logger = getLogger("server:compute:hyperstack:disk");

export async function increaseDiskSize({
  id,
  configuration,
  state,
}: {
  id: number;
  configuration: HyperstackConfiguration;
  state: State;
}) {
  logger.debug("increaseDiskSize ", id, state, configuration.diskSizeGb);
  const { region_name } = configuration;
  let { diskSizeGb = DEFAULT_DISK } = configuration;
  if (diskSizeGb == null) {
    throw Error("diskSizeGb must be defined");
  }
  // We look at what is currently allocated.  If it doesn't add up to diskSizeGb, we
  // create another volume to get to that size and attach it to the instance if it is
  // running.
  const environment_name = await ensureEnvironment(region_name);

  // assume integer size
  diskSizeGb = Math.ceil(diskSizeGb);

  let disks = await getDisks({ id, environment_name });
  // discard boot disk
  disks = disks.filter((x) => !x.name.endsWith("-0"));
  // sum up sizes
  const currentDiskSizeGb = disks.reduce((x, value) => x + value.size, 0);
  logger.debug("increaseDiskSize ", id, { currentDiskSizeGb, diskSizeGb });
  if (diskSizeGb <= currentDiskSizeGb) {
    // nothing to do
    return;
  }
  if (disks.length + 1 >= MAX_DISKS) {
    throw Error("disk cannot be expanded further");
  }

  let amountToEnlarge = diskSizeGb - currentDiskSizeGb;
  logger.debug("increaseDiskSize ", id, { amountToEnlarge });

  const name = await getDiskName({ id }, disks.length + 1);
  logger.debug("increaseDiskSize: create a new disk...", { name });
  const volume = await createVolume({
    name,
    size: amountToEnlarge,
    environment_name,
  });
  logger.debug("increaseDiskSize: update server data");
  const data = await getData({ id });
  if (data?.cloud != "hyperstack") {
    throw Error(
      "state: data defined by data.cloud isn't hyperstack -- stale data?",
    );
  }
  const data_disks = data.disks ?? ([] as number[]);
  data_disks.push(volume.id);
  await setData({
    id,
    data: { disks: data_disks },
  });
  if (state == "running" && data.vm?.id) {
    logger.debug("increaseDiskSize: attach new disk");
    await attachVolumes({ vm_id: data.vm.id, volume_ids: [volume.id] });
  }
}

export async function attachVolumes({
  vm_id, // id in hyperstack of the vm, i.e., data.vm.id
  volume_ids,
  maxTime = 1000 * 60 * 10, // 10 minutes
  f,
}: {
  vm_id: number;
  volume_ids: number[];
  maxTime?: number;
  f?: () => Promise<void>;
}) {
  if (!vm_id) {
    throw Error(`invalid vm id ${vm_id}`);
  }
  logger.debug("attaching ", volume_ids, " to ", vm_id);
  // this is painful since you can't attach disks until the VM is getting going sufficiently
  // and the disks are created properly.
  const t0 = Date.now();
  let d = 3000;
  while (Date.now() - t0 <= maxTime) {
    try {
      await attachVolume0({
        virtual_machine_id: vm_id,
        volume_ids,
      });
      logger.debug("successfully attached volumes to ", vm_id, volume_ids);
      break;
    } catch (err) {
      if (`${err}`.includes("not_found")) {
        // the VM doesn't exist at all, so no way to attach disk ever
        throw err;
      }
      // be a lot smarter regarding content of the error, status of the VM, webhooks, etc.
      logger.debug(`WARNING: waiting so we can attach disks: ${err}`);
      await f?.();
    }
    d = Math.min(10000, d * 1.3);
    await delay(d);
  }
}

// Get all disks for the given compute server.. This uses potentially our cached list of volumes, but is
// scary since we're fetching ALL volumes across hyperstack that we own.
// Later we will rewrite to use a webhook approach,
// which will make this more efficient, hopefully.
async function getDisks({ id, environment_name }) {
  const allVolumes = await getVolumes();
  const prefix = `${await getServerName({ id })}-`;
  // keep the ones that are definitely for our VM
  return allVolumes.filter(
    (x) => x.name.startsWith(prefix) && x.environment.name == environment_name,
  );
}

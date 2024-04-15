/*
Ensure that any VM's and disks in hyperstack match what we think exists
according to the database.

This is critical to do periodically, since otherwise if a nodejs process crashes
(or there is a bug, etc.), e.g., when creating a VM, then (1) we might pay for
that VM as it is running, but not be using or charging for it, and (2) a user
might get blocked from creating their VM.  Similar remarks about to disks.
*/

import getPool from "@cocalc/database/pool";
import {
  deleteVirtualMachine,
  deleteVolume,
  getVirtualMachines,
  getVolumes,
} from "./client";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { getPrefix } from "./names";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:cloud:hyperstack:sync");

// do not delete mysterious garbage volumes until at least this long after they were created,
// since e.g., when making a new VM we could easily create a couple of new volumes before adding
// references to them in our database.
const VOLUME_BIRTH_THRESH_MS = 10 * 60 * 1000;
// Similar for VM's -- always can delete them next time around.
const VM_BIRTH_THRESH_MS = 7 * 60 * 1000;

export async function globalResourceSync() {
  const { hyperstack_api_key } = await getServerSettings();
  if (!hyperstack_api_key) {
    logger.debug("globalResourceSync: hyperstack not configured (skipping)");
    return;
  }
  logger.debug("globalResourceSync: Get all the virtual machines...");
  const prefix = await getPrefix();
  const vmRegex = new RegExp(`^${prefix}-\\d+$`);

  // FIRST: make sure VM's are consistent
  // get the vm's associated with our cocalc server
  const vms = (await getVirtualMachines()).filter((x) => vmRegex.test(x.name));
  logger.debug(
    `globalResourceSync: Got ${vms.length} virtual machines for this cocalc with prefix ${prefix}...`,
  );
  if (vms.length > 0) {
    const servers = await getInstantiatedServers();
    // For each vm, check that the state in our database is NOT off or deprovisioned.
    // If it is, delete the vm.
    for (const vm of vms) {
      const match = vm.name.match(vmRegex);
      if (match) {
        const id = parseInt(match[0].replace(`${prefix}-`, ""));
        if (servers[id] == null) {
          const created = new Date(vm.created_at).valueOf();
          const age = Date.now() - created;
          if (age <= VM_BIRTH_THRESH_MS) {
            logger.debug(
              `globalResourceSync: server ${id} is off or deprovisioned, so the VM should not exist.  -- BUT ignoring since so young: ${
                age / 1000
              }s old`,
            );
          } else {
            logger.debug(
              `globalResourceSync: server ${id} is off or deprovisioned, so the VM should not exist.  Let's delete it.`,
            );
            await deleteVirtualMachine(vm.id);
          }
        } else {
          logger.debug(
            `globalResourceSync: server ${id} is ${servers[id].state} so this is consistent`,
          );
        }
      }
    }
  }

  // SECOND: make sure volumes are consistent
  const volumeRegex = new RegExp(`^${prefix}-\\d+-\\d+$`);
  const volumes = (await getVolumes()).filter((x) => volumeRegex.test(x.name));
  logger.debug(
    `globalResourceSync: Got ${volumes.length} volumes for this cocalc with prefix ${prefix}...`,
  );
  if (volumes.length > 0) {
    const disks = await getInstantiatedDisks();
    // all the disks that SHOULD exist in the hyperstack cloud
    const allDisks = new Set<number>([]);
    for (const id in disks) {
      for (const disk_id of disks[id]) {
        allDisks.add(disk_id);
      }
    }
    let numDeleted = 0;
    for (const volume of volumes) {
      if (!allDisks.has(volume.id)) {
        logger.debug(
          `globalResourceSync: disk in hyperstack with id ${volume.id} not in cocalc db`,
        );
        const created = new Date(volume.created_at).valueOf();
        const age = Date.now() - created;
        if (age <= VOLUME_BIRTH_THRESH_MS) {
          logger.debug(
            `globalResourceSync: disk in hyperstack with id ${
              volume.id
            } not in cocalc db -- BUT ignoring since so young: ${
              age / 1000
            }s old`,
          );
        } else {
          logger.debug(
            `globalResourceSync: disk in hyperstack with id ${volume.id} not in cocalc db -- old, so deleting`,
          );
          try {
            await deleteVolume(volume.id);
            numDeleted += 1;
          } catch (err) {
            logger.debug(`globalResourceSync: deleting ${volume.id} -- ${err}`);
          }
        }
      }
    }
    logger.debug(
      `globalResourceSync: ${
        numDeleted ? `DELETED ${numDeleted} volumes` : "all volumes match up"
      }`,
    );
  }
}

export async function getInstantiatedServers() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, state FROM compute_servers WHERE cloud='hyperstack' AND state!='off' AND state!='deprovisioned'`,
  );
  const v: { [id: number]: { id: number; state: string } } = {};
  for (const row of rows) {
    v[row.id] = row;
  }
  return v;
}

export async function getInstantiatedDisks() {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, data#>'{disks}' AS disks FROM compute_servers WHERE state IS NOT NULL AND state != 'deprovisioned'`,
  );
  const v: { [id: number]: number[] } = {};
  for (const row of rows) {
    v[row.id] = row.disks ?? [];
  }
  return v;
}

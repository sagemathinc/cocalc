/*
Disks are tricky right now with hyperstack, because they do not support
volume enlarge.

I talked to their CTO and they say it won't be hard to add, but we have to
work with what we have today.
*/

import type { State } from "@cocalc/util/db-schema/compute-servers";
import { getVolumes } from "./client";

export async function increaseDiskSize({
  id,
  diskSizeGb,
  state,
}: {
  id: number;
  diskSizeGb: number;
  state: State;
}) {
  // We look at what is currently allocated.  If it doesn't add up to diskSizeGb, we
  // create another volume to get to that size and attach it to the instance if it is
  // running.

  // assume integer size
  diskSizeGb = Math.ceil(diskSizeGb);

  // Get all disks. This uses a global in memory cache that is cleared when new disks are
  // created, so it is safe to call (since only one nodejs process is using the api at a time).
  // Later we will rewrite to use a webhook approach,
  // which will make this more efficient, hopefully.
  const volumes = await getVolumes();
  console.log({ id, state, volumes });
}

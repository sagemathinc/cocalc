/*
Do not change the naming scheme in here without a LOT of thought.

- it is obviously in use in the actual hyperstack cloud
- it may be assumed in subtle ways elsewhere in the code!  This is a leaky
  abstraction and not totally encapsulated here.  E.g., in disk.ts we
  assume the prefix of a disk name is the server name followed by a dash.
*/

import { getServerSettings } from "@cocalc/database/settings/server-settings";
import type { Region } from "@cocalc/util/compute/cloud/hyperstack/api-types";

export async function getPrefix() {
  const { project_hosts_hyperstack_prefix = "cocalc-host" } =
    await getServerSettings();
  return project_hosts_hyperstack_prefix;
}

export async function getServerName(server: { id: number }) {
  const prefix = await getPrefix();
  // in ./sync.ts we assume the server name is of this form in general:
  return `${prefix}-${server.id}`;
}

export async function getDiskName(server: { id: number }, n: number) {
  const name = await getServerName(server);
  return `${name}-${n}`;
}

export async function environmentName(region_name: Region) {
  const prefix = await getPrefix();
  return `${prefix}-${region_name}`;
}

export async function keyPairName(region_name: Region) {
  const prefix = await getPrefix();
  return `${prefix}-${region_name}`;
}

export async function ping() {
  return { now: Date.now() };
}

import { version as versionNumber } from "@cocalc/util/smc-version";
export async function version() {
  return versionNumber;
}



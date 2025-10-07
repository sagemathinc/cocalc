/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Patch } from "./types";
import { cmp_array } from "@cocalc/util/misc";
export * from "@cocalc/util/dmp";
import { type CompressedPatch } from "@cocalc/util/dmp";
export { type CompressedPatch };

export function patch_cmp(a: Patch, b: Patch): number {
  return cmp_array(
    [a.time, a.version, a.user_id],
    [b.time, b.version, b.user_id],
  );
}

export function time_cmp(a: Date, b: Date): number {
  const t = a.valueOf() - b.valueOf();
  if (t < 0) {
    return -1;
  } else if (t > 0) {
    return 1;
  } else {
    return 0;
  }
}

export function isTestClient(client: any) {
  return !!client?.isTestClient?.();
}

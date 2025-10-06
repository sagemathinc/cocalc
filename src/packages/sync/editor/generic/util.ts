/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { type Patch } from "./types";
export { make_patch, apply_patch } from "@cocalc/util/patch";

import { cmp_array } from "@cocalc/util/misc";

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

// Do a 3-way **string** merge by computing patch that transforms
// base to remote, then applying that patch to local.
export function three_way_merge(opts: {
  base: string;
  local: string;
  remote: string;
}): string {
  if (opts.base === opts.remote) {
    // trivial special case...
    return opts.local;
  }
  // @ts-ignore
  return dmp.patch_apply(dmp.patch_make(opts.base, opts.remote), opts.local)[0];
}

export function isTestClient(client: any) {
  return !!client?.isTestClient?.();
}

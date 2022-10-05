/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ComputeImage } from "@cocalc/util/compute-images";
import { isEmpty } from "lodash";

// This sanitization routine checks if the "software environment" information
// is correct, or sets some defaults, etc.
// It's used by the frontend in customize.tsx and the backend in server/software-envs.ts

export interface SoftwareEnvConfig {
  default: string;
  groups: string[];
  environments: { [key: string]: ComputeImage };
}

/**
 * Check that the "software environment" object is valid, set defaults, etc.
 *
 * If there is a problem, it logs it to the given logger and returns "null"
 */
export function sanitizeSoftwareEnv(
  { software, registry }: { software: any; registry?: string },
  L: (...msg) => void
): SoftwareEnvConfig | null {
  const envs = software["environments"] as { [key: string]: ComputeImage };

  if (isEmpty(envs)) {
    L(`No software environments defined`);
    return null;
  }

  // make sure this is an array of strings
  const groups = (software["groups"] ?? []).map((x) => `${x}`) as string[];

  for (const key of Object.keys(envs)) {
    const env = envs[key];
    env["id"] = key;

    // if no registry is set, we're only using the id/key and the data
    // if the registry is set (in particular for on-prem) we use registry:tag to set the image
    if (registry != null) {
      if (typeof env["tag"] !== "string") {
        L(`WARNING: Environment ${key} has no "tag" field -- ignoring`);
        delete envs[key];
        continue;
      }
      env["registry"] = fallback(env["registry"], registry);
    }

    const group = fallback(env["group"], "General");
    env["group"] = group;
    env["title"] = fallback(env["title"], env["tag"], key);
    env["descr"] = fallback(env["descr"], "");
    env["order"] = typeof env["order"] === "number" ? env["order"] : 0;
    env["hidden"] = !!env["hidden"];

    // if group is not in groups, add it
    if (!groups.includes(group)) {
      groups.push(group);
    }
  }

  // test that there is at leat one environemnt left in envs
  if (isEmpty(envs)) {
    L(`No software environments left after sanitization`);
    return null;
  }

  const swDflt = software["default"];
  const dflt = typeof swDflt === "string" ? swDflt : Object.keys(envs)[0];

  return { groups, default: dflt, environments: envs };
}

function fallback(a: any, b: any, c?: string): any {
  if (typeof a === "string") return a;
  if (typeof b === "string") return b;
  return c;
}

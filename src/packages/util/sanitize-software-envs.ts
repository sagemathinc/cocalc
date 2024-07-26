/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { isEmpty, isObject, pick } from "lodash";

import { ComputeImage } from "@cocalc/util/compute-images";
import { DEFAULT_COMPUTE_IMAGE } from "./db-schema/defaults";

// This sanitization routine checks if the "software environment" information
// is correct, or sets some defaults, etc.
// It's used by the frontend in customize.tsx and the backend in server/software-envs.ts

export type Purpose = "server" | "webapp";

const WEBAPP_RELEVANT = [
  "tag",
  "title",
  "registry",
  "descr",
  "order",
  "short",
  "group",
  "hidden",
] as const;

interface Environments {
  [key: string]: ComputeImage;
}

// test if an object is an Environments map – does not need to be a precise test, because the sanitization fixes it
function isEnvironments(envs: Environments): envs is Environments {
  return isObject(envs) && Object.values(envs).every(isObject);
}

export interface SoftwareEnvConfig {
  default: string;
  groups: string[];
  environments: Environments;
}

interface Opts {
  software: any;
  purpose: Purpose;
  registry?: string;
}

/**
 * Check that the "software environment" object is valid, set defaults, default exists, etc.
 *
 * If there is a problem, it logs it to the given logger and returns "null".
 *
 * purpose: "server" returns all values, while "webapp" only filters those, which are relevant for the webapp (and does not expose extra information)
 */
export function sanitizeSoftwareEnv(
  opts: Opts,
  L: (...msg) => void,
): SoftwareEnvConfig | null {
  const { software, registry, purpose } = opts;

  const envs = software["environments"];

  if (isEmpty(envs)) {
    L(`No software environments defined`);
    return null;
  }

  if (!isEnvironments(envs)) {
    L(`Software envs must be a map of strings to environment objects`);
    return null;
  }

  // make sure this is an array of strings
  const groups: string[] = (software["groups"] ?? []).map((x) => `${x}`);

  for (const key of Object.keys(envs)) {
    // if purpose is "webapp", only pick these entries in the env object: title, registry, tag, descr, order, short, group

    const env =
      purpose === "webapp" ? pick(envs[key], WEBAPP_RELEVANT) : envs[key];

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
    if (!env["descr"]) delete env["descr"];
    env["order"] = typeof env["order"] === "number" ? env["order"] : 0;
    if (env["order"] === 0) delete env["order"];
    if (!!env["hidden"]) {
      env["hidden"] = true;
    } else {
      delete env["hidden"];
    }

    envs[key] = { ...env, id: key };

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
  // we check that the default is a string and that it exists in envs
  const dflt =
    typeof swDflt === "string" && envs[swDflt] != null
      ? swDflt
      : Object.keys(envs)[0];

  // this is a fallback entry, when projects were created before the software env was configured
  if (envs[DEFAULT_COMPUTE_IMAGE] == null) {
    envs[DEFAULT_COMPUTE_IMAGE] = { ...envs[dflt], hidden: true };
  }

  return { groups, default: dflt, environments: envs };
}

function fallback(a: any, b: any, c?: string): any {
  if (typeof a === "string") return a;
  if (typeof b === "string") return b;
  return c;
}

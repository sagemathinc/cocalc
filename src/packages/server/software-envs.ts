/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is used by the hub to adjust the "customization" variable for the user visible site, and also by manage in on-prem, to actually get the associated configuration

import { ComputeImage } from "@cocalc/util/compute-images";
import debug from "debug";
import { constants } from "fs";
import { access, readFile } from "fs/promises";
import { isEmpty } from "lodash";
import { join } from "path";

const L = debug("hub:webapp-config");

export interface SoftwareEnvConfig {
  default: string;
  groups: string[];
  environments: { [key: string]: ComputeImage };
}

let cache: SoftwareEnvConfig | false | null = null;

/**
 * A configuration for available software environments could be stored at the location of $COCALC_SOFTWARE_ENVIRONMENTS.
 */
export async function getSoftwareEnvironments(): Promise<SoftwareEnvConfig | null> {
  if (cache === null) {
    cache = (await readConfig()) ?? false;
  }
  return cache === false ? null : cache;
}

async function readConfig(): Promise<SoftwareEnvConfig | false> {
  const dir = process.env.COCALC_SOFTWARE_ENVIRONMENTS;
  if (!dir) return false;
  // Check if a file "software.json" and "registry" exist and are readable at the directory "dir":
  const softwareFn = join(dir, "software.json");
  const registryFn = join(dir, "registry");

  if (!(await isReadable(softwareFn))) {
    L(
      `WARNING: $COCALC_SOFTWARE_ENVIRONMENTS is defined but ${softwareFn} does not exist`
    );
    return false;
  }

  if (!(await isReadable(registryFn))) {
    L(
      `WARNING: $COCALC_SOFTWARE_ENVIRONMENTS is defined but ${registryFn} does not exist`
    );
    return false;
  }

  // read the content of registry and trim it to a one line string
  const registry = (await readFile(registryFn)).toString().trim();

  // parse the content of softwareFn as json
  const software = JSON.parse((await readFile(softwareFn)).toString());
  const envs = software["environments"] as { [key: string]: ComputeImage };

  if (isEmpty(envs)) {
    L(`No environments defined in ${softwareFn}`);
    return false;
  }

  // make sure this is an array of strings
  const groups = (software["groups"] ?? []).map((x) => `${x}`) as string[];

  const envKeys = Object.keys(envs);

  const dflt = software["default"] ?? envKeys[0];

  for (const key of envKeys) {
    const env = envs[key];
    if (env["tag"] == null || typeof env["tag"] !== "string") {
      L(`WARNING: Environment ${key} has no "tag" field -- ignoring`);
      delete envs[key];
      continue;
    }
    env["registry"] = fallback(env["registry"], registry);
    const group = fallback(env["group"], "Standard");
    env["group"] = group;
    env["title"] = fallback(env["title"], env["tag"], key);
    // if group is not in groups, add it
    if (!groups.includes(group)) {
      groups.push(group);
    }
  }

  return { groups, default: dflt, environments: envs };
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
  } catch (err) {
    return false;
  }
  return true;
}

function fallback(a: any, b: any, c?: string): any {
  if (typeof a === "string") return a;
  if (typeof b === "string") return b;
  return c;
}

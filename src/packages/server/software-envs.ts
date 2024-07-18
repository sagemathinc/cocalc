/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// This is used by the hub to adjust the "customization" variable for the user visible site, and also by manage in on-prem, to actually get the associated configuration

import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import getLogger from "@cocalc/backend/logger";
import {
  Purpose,
  sanitizeSoftwareEnv,
  SoftwareEnvConfig,
} from "@cocalc/util/sanitize-software-envs";

const logger = getLogger("hub:software-envs");
const L = logger.debug;
const W = logger.warn;

const cache: { [key in Purpose]: SoftwareEnvConfig | false | null } = {
  server: null,
  webapp: null,
};

/**
 * A configuration for available software environments could be stored at the location of $COCALC_SOFTWARE_ENVIRONMENTS.
 */
export async function getSoftwareEnvironments(
  purpose: Purpose,
): Promise<SoftwareEnvConfig | null> {
  if (cache[purpose] === null) {
    cache[purpose] = (await readConfig(purpose)) ?? false;
  }
  const data = cache[purpose];
  return data === false ? null : data;
}

async function readConfig(purpose: Purpose): Promise<SoftwareEnvConfig | null> {
  const dir = process.env.COCALC_SOFTWARE_ENVIRONMENTS;
  if (!dir) return null;
  // Check if a file "software.json" and "registry" exist and are readable at the directory "dir":
  const softwareFn = join(dir, "software.json");
  const registryFn = join(dir, "registry");

  if (!(await isReadable(softwareFn))) {
    W(
      `WARNING: $COCALC_SOFTWARE_ENVIRONMENTS is defined but ${softwareFn} does not exist`,
    );
    return null;
  }

  if (!(await isReadable(registryFn))) {
    W(
      `WARNING: $COCALC_SOFTWARE_ENVIRONMENTS is defined but ${registryFn} does not exist`,
    );
    return null;
  }

  // read the content of registry and trim it to a one line string
  const registry = (await readFile(registryFn)).toString().trim();

  // parse the content of softwareFn as json
  try {
    const software = JSON.parse((await readFile(softwareFn)).toString());
    const dbg = (...msg) => L(...msg);
    const sanitized = sanitizeSoftwareEnv({ software, registry, purpose }, dbg);
    return sanitized;
  } catch (err) {
    W(`WARNING: ${softwareFn} is not a valid JSON file -- ${err}`);
    return null;
  }
}

async function isReadable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
  } catch (err) {
    return false;
  }
  return true;
}

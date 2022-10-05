/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is used by the hub to adjust the "customization" variable for the user visible site, and also by manage in on-prem, to actually get the associated configuration

import getLogger from "@cocalc/backend/logger";
import { constants } from "fs";
import { access, readFile } from "fs/promises";
import { join } from "path";
import {
  sanitizeSoftwareEnv,
  SoftwareEnvConfig,
} from "@cocalc/util/sanitize-software-envs";

const logger = getLogger("hub:webapp-config");
const L = logger.debug;
const W = logger.warn;

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

async function readConfig(): Promise<SoftwareEnvConfig | null> {
  const dir = process.env.COCALC_SOFTWARE_ENVIRONMENTS;
  if (!dir) return null;
  // Check if a file "software.json" and "registry" exist and are readable at the directory "dir":
  const softwareFn = join(dir, "software.json");
  const registryFn = join(dir, "registry");

  if (!(await isReadable(softwareFn))) {
    W(
      `WARNING: $COCALC_SOFTWARE_ENVIRONMENTS is defined but ${softwareFn} does not exist`
    );
    return null;
  }

  if (!(await isReadable(registryFn))) {
    W(
      `WARNING: $COCALC_SOFTWARE_ENVIRONMENTS is defined but ${registryFn} does not exist`
    );
    return null;
  }

  // read the content of registry and trim it to a one line string
  const registry = (await readFile(registryFn)).toString().trim();

  // parse the content of softwareFn as json
  try {
    const software = JSON.parse((await readFile(softwareFn)).toString());
    const sanitized = sanitizeSoftwareEnv({ software, registry }, (...msg) =>
      L(...msg)
    );
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

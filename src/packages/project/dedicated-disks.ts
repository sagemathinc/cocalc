/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This makes dedicated disks conveniently available from the $HOME directory – a kucalc-only functionality.
*/

import { promises as fs, constants as fs_constants } from "fs";
const { F_OK, W_OK, R_OK } = fs_constants;
import { join } from "path";
import { homedir } from "os";
import { isArray } from "lodash";
import { getLogger } from "./logger";
const { info, warn } = getLogger("dedicated-disks");
import { getProjectConfig } from "./project-setup";

async function ensure_symlink(name: string) {
  const disk = join("/", "local", name);
  const link = join(homedir(), `${disk}-${name}`);
  try {
    await fs.access(disk, F_OK | R_OK | W_OK);
  } catch {
    warn(`disk directory ${disk} not writeable -- abort`);
    return;
  }
  // create a symlink if there isn't already a file (or exactly that symlink)
  // don't disturb what's already there
  try {
    await fs.access(link, F_OK);
    info(`'${link}' already exists`);
    return;
  } catch {
    // link does not exist, hence we create it
    try {
      await fs.symlink(disk, link);
      info(`successfully symlinked ${link} → ${disk}`);
    } catch (err) {
      warn(`problem symlinking ${link} → ${disk} -- {err}`);
    }
  }
}

export async function init() {
  info("initializing");
  const conf = getProjectConfig();
  // we're a bit extra careful, because there could be anything in the DB
  if (conf?.quota?.dedicated_disks == null) return;
  if (!isArray(conf.quota.dedicated_disks)) return;
  for (const disk of conf.quota.dedicated_disks) {
    if (typeof disk.name === "string") {
      await ensure_symlink(disk.name);
    }
  }
}

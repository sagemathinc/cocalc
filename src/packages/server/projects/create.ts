/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { getSoftwareEnvironments } from "@cocalc/server/software-envs";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema/defaults";
import { isValidUUID } from "@cocalc/util/misc";
import { v4 } from "uuid";
import { associatedLicense } from "@cocalc/server/licenses/public-path";
import getFromPool from "@cocalc/server/projects/pool/get-project";
import getLogger from "@cocalc/backend/logger";
import { getProject } from "@cocalc/server/projects/control";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import { delay } from "awaiting";
import isAdmin from "@cocalc/server/accounts/is-admin";

const log = getLogger("server:projects:create");

export default async function createProject(opts: CreateProjectOptions) {
  if (opts.account_id != null) {
    if (!isValidUUID(opts.account_id)) {
      throw Error("if account_id given, it must be a valid uuid v4");
    }
  }
  log.debug("createProject ", opts);

  const {
    account_id,
    title,
    description,
    image,
    public_path_id,
    noPool,
    start,
    ephemeral,
  } = opts;
  let license = opts.license;
  if (public_path_id) {
    const site_license_id = await associatedLicense(public_path_id);
    if (site_license_id) {
      if (!license) {
        license = site_license_id;
      } else {
        license = license + "," + site_license_id;
      }
    }
  }
  let project_id;
  if (opts.project_id) {
    if (!account_id || !(await isAdmin(account_id))) {
      throw Error("only admins can specify the project_id");
    }
    project_id = opts.project_id;
  } else {
    // Try to get from pool if no license and no image specified (so the default),
    // and not "noPool".  NOTE: we may improve the pool to also provide some
    // basic licensed projects later, and better support for images.  Maybe.
    if (!noPool && !license && account_id != null) {
      project_id = await getFromPool({
        account_id,
        title,
        description,
        image,
      });
      if (project_id != null) {
        return project_id;
      }
    }

    project_id = v4();
  }

  const pool = getPool();
  const users =
    account_id == null ? null : { [account_id]: { group: "owner" } };
  let site_license;
  if (license) {
    site_license = {};
    for (const license_id of license.split(",")) {
      site_license[license_id] = {};
    }
  } else {
    site_license = undefined;
  }

  const envs = await getSoftwareEnvironments("server");

  await pool.query(
    "INSERT INTO projects (project_id, title, description, users, site_license, compute_image, created, last_edited, ephemeral) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7::BIGINT)",
    [
      project_id,
      title ?? "No Title",
      description ?? "",
      users != null ? JSON.stringify(users) : users,
      site_license != null ? JSON.stringify(site_license) : undefined,
      image ?? envs?.default ?? DEFAULT_COMPUTE_IMAGE,
      ephemeral ?? null,
    ],
  );

  const project = getProject(project_id);
  await project.state();
  if (start) {
    // intentionally not blocking
    startNewProject(project, project_id);
  }

  return project_id;
}

async function startNewProject(project, project_id: string) {
  log.debug("startNewProject", { project_id });
  try {
    await project.start();
    // just in case
    await delay(5000);
    await project.start();
  } catch (err) {
    log.debug(`WARNING: problem starting new project -- ${err}`, {
      project_id,
    });
  }
}

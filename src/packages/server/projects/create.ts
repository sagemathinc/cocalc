/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { getSoftwareEnvironments } from "@cocalc/server/software-envs";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema/defaults";
import { isValidUUID } from "@cocalc/util/misc";
import { v4 } from "uuid";
import { associatedLicense } from "@cocalc/server/licenses/public-path";
import getFromPool from "@cocalc/server/projects/pool/get-project";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("server:projects:create");

interface Options {
  account_id?: string;
  title?: string;
  description?: string;
  image?: string;
  license?: string;
  public_path_id?: string; // may imply use of a license
  noPool?: boolean; // do not allow using the pool (e.g., need this when creating projects to put in the pool); not a real issue since when creating for pool account_id is null, and then we wouldn't use the pool...
}

export default async function createProject(opts: Options) {
  if (opts.account_id != null) {
    if (!isValidUUID(opts.account_id)) {
      throw Error("if account_id given, it must be a valid uuid v4");
    }
  }
  log.debug("createProject ", opts);

  const { account_id, title, description, image, public_path_id, noPool } =
    opts;
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
  // Try to get from pool if no license and no image specified (so the default),
  // and not "noPool".  NOTE: we may improve the pool to also provide some
  // basic licensed projects later, and better support for images.  Maybe.
  if (!noPool && !license && account_id != null) {
    const project_id = await getFromPool({
      account_id,
      title,
      description,
      image,
    });
    if (project_id != null) {
      return project_id;
    }
  }

  const project_id = v4();
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
    "INSERT INTO projects (project_id, title, description, users, site_license, compute_image, created, last_edited) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    [
      project_id,
      title ?? "No Title",
      description ?? "",
      users != null ? JSON.stringify(users) : users,
      site_license != null ? JSON.stringify(site_license) : undefined,
      image ?? envs?.default ?? DEFAULT_COMPUTE_IMAGE,
    ]
  );
  return project_id;
}

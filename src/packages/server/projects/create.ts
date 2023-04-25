/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getPool from "@cocalc/database/pool";
import { getSoftwareEnvironments } from "@cocalc/server/software-envs";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema/defaults";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";
import { v4 } from "uuid";
import { associatedLicense } from "@cocalc/server/licenses/public-path";

interface Options {
  account_id?: string;
  title?: string;
  description?: string;
  image?: string;
  license?: string;
  public_path_id?: string; // may imply use of a license
}

export default async function createProject({
  account_id,
  title,
  description,
  image,
  license,
  public_path_id,
}: Options) {
  if (account_id != null) {
    if (!isValidUUID(account_id)) {
      throw Error("if account_id given, it must be a valid uuid v4");
    }
  }
  const project_id = v4();
  const pool = getPool();
  const users =
    account_id == null ? null : { [account_id]: { group: "owner" } };
  let site_license;
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
      JSON.stringify(users),
      site_license != null ? JSON.stringify(site_license) : undefined,
      image ?? envs?.default ?? DEFAULT_COMPUTE_IMAGE,
    ]
  );
  return project_id;
}

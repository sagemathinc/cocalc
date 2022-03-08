import getPool from "@cocalc/database/pool";
import { is_valid_uuid_string as isValidUUID } from "@cocalc/util/misc";
import { v4 } from "uuid";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/compute-images";

interface Options {
  account_id: string;
  title?: string;
  description?: string;
  image?: string;
  license?: string;
}

export default async function createProject({
  account_id,
  title,
  description,
  image,
  license,
}: Options) {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const project_id = v4();
  const pool = getPool();
  const users = { [account_id]: { group: "owner" } };
  let site_license;
  if (license) {
    site_license = {};
    for (const x in license.split(",")) {
      site_license[x] = {};
    }
  } else {
    site_license = undefined;
  }

  await pool.query(
    "INSERT INTO projects (project_id, title, description, users, site_license, compute_image, created, last_edited) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW())",
    [
      project_id,
      title,
      description,
      JSON.stringify(users),
      site_license != null ? JSON.stringify(site_license) : undefined,
      image ?? DEFAULT_COMPUTE_IMAGE,
    ]
  );
  return project_id;
}

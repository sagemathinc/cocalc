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
import getLogger from "@cocalc/backend/logger";
import { getProject } from "@cocalc/server/projects/control";
import { type CreateProjectOptions } from "@cocalc/util/db-schema/projects";
import { delay } from "awaiting";
import isAdmin from "@cocalc/server/accounts/is-admin";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { client as filesystemClient } from "@cocalc/conat/files/file-server";
import { createHostControlClient } from "@cocalc/conat/project-host/api";
import { conatWithProjectRouting } from "../conat/route-client";
import {
  computePlacementPermission,
  type UserTier,
} from "@cocalc/server/project-host/placement";

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
    rootfs_image,
    public_path_id,
    start,
    src_project_id,
    ephemeral,
    host_id: requested_host_id,
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
    project_id = v4();
  }

  const pool = getPool();
  let host_id: string | undefined = requested_host_id;
  let host: any | undefined;

  async function resolveHostPlacement(host_id: string) {
    if (!account_id) {
      throw Error("must be signed in to place a project on a host");
    }
    const { rows } = await pool.query(
      "SELECT * FROM project_hosts WHERE id=$1",
      [host_id],
    );
    const row = rows[0];
    if (!row) {
      throw Error(`host ${host_id} not found`);
    }
    const metadata = row.metadata ?? {};
    const owner = metadata.owner;
    const collaborators: string[] = metadata.collaborators ?? [];
    const tier = row.tier as "free" | "member" | "pro" | undefined;
    // TODO: determine real user tier when membership tiers are implemented.
    const userTier: UserTier = "member";
    const { can_place } = computePlacementPermission({
      tier,
      userTier,
      isOwner: owner === account_id,
      isCollab: collaborators.includes(account_id ?? ""),
    });
    if (!can_place) {
      throw Error("not allowed to place a project on that host");
    }
    return {
      host_id,
      host: {
        public_url: row.public_url,
        internal_url: row.internal_url,
        ssh_server: row.ssh_server,
        name: row.name,
        region: row.region,
        tier: row.tier,
      },
    };
  }

  if (src_project_id) {
    if (
      !account_id ||
      !(await isCollaborator({ account_id, project_id: src_project_id }))
    ) {
      throw Error("user must be a collaborator on src_project_id");
    }
    // keep the clone on the same project-host as the source unless explicitly overridden
    const { rows } = await pool.query(
      "SELECT host_id, host FROM projects WHERE project_id=$1",
      [src_project_id],
    );
    if (!host_id && rows[0]?.host_id) {
      host_id = rows[0].host_id;
      host = rows[0]?.host;
    }
    // create filesystem for new project as a clone.
    // Route clone to the host that owns the source project.
    const client = filesystemClient({ project_id: src_project_id });
    await client.clone({ project_id, src_project_id });
  }

  if (host_id && !host) {
    ({ host_id, host } = await resolveHostPlacement(host_id));
  }
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
    "INSERT INTO projects (project_id, title, description, users, site_license, compute_image, created, last_edited, rootfs_image, ephemeral, host_id, host) VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7, $8::BIGINT, $9, $10)",
    [
      project_id,
      title ?? "No Title",
      description ?? "",
      users != null ? JSON.stringify(users) : users,
      site_license != null ? JSON.stringify(site_license) : undefined,
      image ?? envs?.default ?? DEFAULT_COMPUTE_IMAGE,
      rootfs_image,
      ephemeral ?? null,
      host_id ?? null,
      host != null ? JSON.stringify(host) : null,
    ],
  );

  // If this is a clone with a known host, register the project row on that host
  // so it is visible in its local sqlite/changefeeds without starting it.
  if (host_id) {
    try {
      const client = createHostControlClient({
        host_id,
        client: conatWithProjectRouting(),
        timeout: 10000,
      });
      await client.createProject({
        project_id,
        title,
        users,
        image: rootfs_image ?? image,
        start: false,
      });
    } catch (err) {
      log.warn("createProject: failed to register clone on host", {
        project_id,
        host_id,
        err: `${err}`,
      });
    }
  }

  if (start) {
    const project = getProject(project_id);
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

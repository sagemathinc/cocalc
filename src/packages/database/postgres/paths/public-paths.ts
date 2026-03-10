/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Queries related to public_paths. */

import { callback2 } from "@cocalc/util/async-utils";
import { PublicPath } from "@cocalc/util/db-schema/public-paths";
import {
  deep_copy,
  is_valid_uuid_string,
  path_is_in_public_paths,
  path_to_file,
} from "@cocalc/util/misc";
import { QueryRows } from "@cocalc/util/types/database";

import { query } from "../query";
import { PostgreSQL, PublicPathListing } from "../types";

/* Unlist all public paths on all projects that the
given account is a collaborator on.  If is_owner is
true (the default), only projects the account_id
is the owner of are considered.

This is not written to be optimally fast since it should
barely ever get used.
*/
export async function unlist_all_public_paths(
  db: PostgreSQL,
  account_id: string,
  is_owner: boolean = true,
): Promise<void> {
  const project_ids = await callback2(db.get_project_ids_with_user, {
    account_id,
    is_owner,
  });
  await query({
    db,
    query: "UPDATE public_paths SET unlisted=true",
    where: { "project_id = ANY($)": project_ids },
  });
}

export async function get_all_public_paths(
  db: PostgreSQL,
  account_id: string,
): Promise<PublicPath[]> {
  if (!is_valid_uuid_string(account_id)) {
    throw Error(`account_id="${account_id}" must be a valid uuid`);
  }
  return await query({
    db,
    query: `SELECT pp.id, pp.project_id, pp.path, pp.description, pp.disabled, pp.authenticated, pp.unlisted, pp.license, pp.last_edited, pp.created, pp.last_saved, pp.counter, pp.compute_image
    FROM public_paths AS pp, projects
    WHERE pp.project_id = projects.project_id
      AND projects.users ? '${account_id}'
      AND projects.last_active ? '${account_id}'
    ORDER BY pp.last_edited DESC`,
  });
}

export interface GetPublicPathsOptions {
  project_id: string;
}

export async function get_public_paths(
  db: PostgreSQL,
  opts: GetPublicPathsOptions,
): Promise<string[]> {
  if (!is_valid_uuid_string(opts.project_id)) {
    throw new Error(`invalid project_id -- ${opts.project_id}`);
  }

  const { rows } = await callback2<QueryRows<{ path?: string }>>(
    db._query.bind(db),
    {
      query: "SELECT path FROM public_paths",
      where: [
        { "project_id = $::UUID": opts.project_id },
        "disabled IS NOT TRUE",
      ],
    },
  );

  return rows
    .map((row) => row.path)
    .filter((path): path is string => typeof path === "string");
}

export interface HasPublicPathOptions {
  project_id: string;
}

export async function has_public_path(
  db: PostgreSQL,
  opts: HasPublicPathOptions,
): Promise<boolean> {
  const { rows } = await callback2<QueryRows<{ count?: number | string }>>(
    db._query.bind(db),
    {
      query: "SELECT COUNT(path) AS count FROM public_paths",
      where: [
        { "project_id = $::UUID": opts.project_id },
        "disabled IS NOT TRUE",
      ],
    },
  );

  const count = parseInt(`${rows[0]?.count ?? 0}`, 10);
  return count > 0;
}

export interface PathIsPublicOptions {
  project_id: string;
  path: string;
}

export async function path_is_public(
  db: PostgreSQL,
  opts: PathIsPublicOptions,
): Promise<boolean> {
  const public_paths = await get_public_paths(db, {
    project_id: opts.project_id,
  });
  return path_is_in_public_paths(opts.path, public_paths);
}

export interface FilterPublicPathsOptions {
  project_id: string;
  path: string;
  listing: PublicPathListing;
}

export async function filter_public_paths(
  db: PostgreSQL,
  opts: FilterPublicPathsOptions,
): Promise<PublicPathListing> {
  const public_paths = await get_public_paths(db, {
    project_id: opts.project_id,
  });

  if (path_is_in_public_paths(opts.path, public_paths)) {
    return opts.listing;
  }

  const listing = deep_copy(opts.listing) as PublicPathListing;
  const files = Array.isArray(listing.files) ? listing.files : [];
  listing.files = files.filter((entry) => {
    const name = entry?.name;
    if (typeof name !== "string") {
      return false;
    }
    return path_is_in_public_paths(path_to_file(opts.path, name), public_paths);
  });

  return listing;
}

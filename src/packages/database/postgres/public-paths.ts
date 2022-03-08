/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Queries related to public_paths.

Probably more need to be rewritten and moved here...
*/

import { callback2 } from "@cocalc/util/async-utils";
import { PostgreSQL } from "./types";
import { query } from "./query";
import { is_valid_uuid_string } from "@cocalc/util/misc";
import { PublicPath } from "@cocalc/util/db-schema/public-paths";

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
  is_owner: boolean = true
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
  account_id: string
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

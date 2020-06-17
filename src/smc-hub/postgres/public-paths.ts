/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Queries related to public_paths.

Probably more need to be rewritten and moved here...
*/

import { callback2 } from "../../smc-util/async-utils";
import { PostgreSQL } from "./types";
import { query } from "./query";

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

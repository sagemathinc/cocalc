/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This migrates the model of one single account creation token in the server settings
// to the newer model, where there are several configurable tokens.

import { PostgreSQL } from "./types";
import { callback2 as cb2 } from "../../smc-util/async-utils";
import * as debug from "debug";
const LOG = debug("hub:migrate:account_token");

export async function migrate_account_token(db: PostgreSQL) {
  const token = await cb2(db.get_server_setting, {
    name: "account_creation_token",
  });
  if (token == null) return;

  if (token != "") {
    LOG(`Migrating account token ...`);
    await cb2(db._query, {
      query: "INSERT INTO account_tokens",
      values: {
        "token::TEXT": token,
        "desc::TEXT": `Migrated from Site Settings`,
      },
      conflict: "token",
    });
  }

  // get rid of this field in any case (empty string)
  await cb2(db._query, {
    query: "DELETE FROM server_settings",
    where: { "name = $::TEXT": "account_creation_token" },
  });

  db.reset_server_settings_cache();
  LOG(`Account token migrated from Site Settings to Account Tokens table`);
}

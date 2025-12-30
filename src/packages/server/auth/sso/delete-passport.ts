import { isBlockedUnlinkStrategy } from "@cocalc/server/auth/sso/unlink-strategy";
import type {
  DeletePassportOpts,
  PostgreSQL,
} from "@cocalc/database/postgres/types";
import { _passport_key } from "@cocalc/database/postgres/account/passport-key";
import { callback2 } from "@cocalc/util/async-utils";

export async function delete_passport(
  db: PostgreSQL,
  opts: DeletePassportOpts,
) {
  db._dbg("delete_passport")(JSON.stringify({ strategy: opts.strategy }));

  if (
    await isBlockedUnlinkStrategy({
      strategyName: opts.strategy,
      account_id: opts.account_id,
    })
  ) {
    throw Error(`You are not allowed to unlink '${opts.strategy}'`);
  }

  await callback2(db._query, {
    query: "UPDATE accounts",
    jsonb_set: {
      // delete it
      passports: { [_passport_key(opts)]: null },
    },
    where: {
      "account_id = $::UUID": opts.account_id,
    },
  });
}

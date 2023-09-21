import { isBlockedUnlinkStrategy } from "@cocalc/server/auth/sso/unlink-strategy";
import type {
  DeletePassportOpts,
  PostgreSQL,
} from "@cocalc/database/postgres/types";
import { _passport_key } from "@cocalc/database/postgres/passport";

export async function delete_passport(
  db: PostgreSQL,
  opts: DeletePassportOpts,
) {
  db._dbg("delete_passport")(
    JSON.stringify({ strategy: opts.strategy, id: opts.id }),
  );

  if (
    await isBlockedUnlinkStrategy({
      strategyName: opts.strategy,
      account_id: opts.account_id,
    })
  ) {
    const err_msg = `You are not allowed to unlink '${opts.strategy}'`;
    if (typeof opts.cb === "function") {
      opts.cb(err_msg);
      return;
    } else {
      throw new Error(err_msg);
    }
  }

  return db._query({
    query: "UPDATE accounts",
    jsonb_set: {
      // delete it
      passports: { [_passport_key(opts)]: null },
    },
    where: {
      "account_id = $::UUID": opts.account_id,
    },
    cb: opts.cb,
  });
}

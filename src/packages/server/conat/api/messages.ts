import send0 from "@cocalc/server/messages/send";
import { cloneDeep } from "lodash";
import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";

export async function send(opts) {
  if (!opts.account_id) {
    throw Error("invalid account");
  }
  const opts2: any = cloneDeep(opts);
  opts2.from_id = opts.account_id;
  const v = opts.to_ids.filter((x) => x.includes("@"));
  if (v.length > 0) {
    opts2.to_ids = opts.to_ids.filter(isValidUUID);
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT account_id FROM accounts WHERE email_address=ANY($1)",
      [v],
    );
    for (const { account_id } of rows) {
      opts2.to_ids.push(account_id);
    }
  }
  return await send0(opts2);
}

import get from "@cocalc/server/messages/get";
export { get };

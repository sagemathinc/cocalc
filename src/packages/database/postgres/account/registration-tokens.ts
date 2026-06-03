import { callback2 } from "@cocalc/util/async-utils";
import { PostgreSQL } from "../types";

function isDelete(options: { delete?: boolean }[]) {
  return options.some((v) => v?.delete === true);
}

interface Query {
  token: string;
  descr?: string;
  expires?: Date;
  limit?: number;
  disabled?: boolean;
  ephemeral?: boolean;
  customize?;
}

export default async function registrationTokensQuery(
  db: PostgreSQL,
  options: { delete?: boolean }[],
  query: Query,
) {
  if (isDelete(options) && query.token) {
    // delete if option is set and there is a token which is defined and not an empty string
    await callback2(db._query, {
      query: "DELETE FROM registration_tokens WHERE token = $1",
      params: [query.token],
    });
    return;
  }

  // either we want to get all tokens or insert/edit one
  if (query.token == "*") {
    // select all tokens -- there is of course no WHERE clause, since this is not user specific.
    // It's the same tokens for any ADMIN.
    const { rows } = await callback2(db._query, {
      query: "SELECT * FROM registration_tokens",
    });
    return rows;
  } else if (query.token) {
    // upsert an existing one
    const { token, descr, expires, limit, disabled, ephemeral, customize } =
      query;
    const { rows } = await callback2(db._query, {
      query: `INSERT INTO registration_tokens ("token","descr","expires","limit","disabled","ephemeral","customize")
                VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (token)
                DO UPDATE SET
                  "token"    = EXCLUDED.token,
                  "descr"    = EXCLUDED.descr,
                  "expires"  = EXCLUDED.expires,
                  "limit"    = EXCLUDED.limit,
                  "disabled" = EXCLUDED.disabled,
                  "ephemeral" = EXCLUDED.ephemeral,
                  "customize" = EXCLUDED.customize`,
      params: [
        token,
        descr ? descr : null,
        expires ? expires : null,
        limit == null ? null : limit, // if undefined make it null
        disabled != null ? disabled : false,
        ephemeral == null ? null : ephemeral,
        customize == null ? null : customize,
      ],
    });
    return rows;
  } else {
    throw new Error("don't know what to do with this query");
  }
}

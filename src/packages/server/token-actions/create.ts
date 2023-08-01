import type { Description } from "@cocalc/util/db-schema/token-actions";
import { generateToken } from "@cocalc/util/db-schema/token-actions";
import dayjs from "dayjs";
import getPool from "@cocalc/database/pool";
import siteURL from "@cocalc/server/settings/site-url";

export default async function createTokenAction(
  description: Description,
  expire?: Date
): Promise<{ token: string; type: string }> {
  const pool = getPool();
  const token = generateToken();
  await pool.query(
    "INSERT INTO token_actions(token, expire, description) VALUES($1,$2,$3)",
    [token, expire ?? dayjs().add(3, "days").toDate(), description]
  );
  return { token, type: description.type };
}

export async function disableDailyStatements(
  account_id: string
): Promise<string> {
  return await getTokenUrl(
    await createTokenAction({
      type: "disable-daily-statements",
      account_id,
    })
  );
}

export async function getTokenUrl({
  token,
  type,
}: {
  token: string;
  type: string;
}): Promise<string> {
  return `${await siteURL()}/token?token=${token}&type=${encodeURIComponent(
    type
  )}`;
}

export async function getResultUrl(result: string): Promise<string> {
  return `${await siteURL()}/token?result=${encodeURIComponent(result)}`;
}

export async function makePayment(opts: {
  account_id: string;
  amount: number;
}): Promise<string> {
  return await getTokenUrl(
    await createTokenAction({
      type: "make-payment",
      ...opts,
    })
  );
}

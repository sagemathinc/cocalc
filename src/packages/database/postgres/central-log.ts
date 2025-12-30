import getPool from "@cocalc/database/pool";
import { pii_expire } from "./account/pii";
import { uuid } from "@cocalc/util/misc";

// log events, which contain personal information (email, account_id, ...)
const PII_EVENTS = new Set([
  "create_account",
  "change_password",
  "change_email_address",
  "webapp-add_passport",
  "get_user_auth_token",
  "successful_sign_in",
  "webapp-email_sign_up",
  "create_account_registration_token",
]);

export default async function centralLog({
  event,
  value,
}: {
  event: string;
  value: object;
}) {
  const pool = getPool();

  let expire;
  if (value["ip_address"] || value["email_address"] || PII_EVENTS.has(event)) {
    const date = await pii_expire();
    if (date == null) {
      expire = "NOW() + INTERVAL '6 MONTHS'";
    } else {
      expire = `NOW() + INTERVAL '${(date.valueOf() - Date.now()) / 1000} seconds'`;
    }
  } else if (event == "uncaught_exception") {
    expire = "NOW() + INTERVAL '1 MONTH'";
  } else {
    expire = "NOW() + INTERVAL '1 YEAR'";
  }
  await pool.query(
    `INSERT INTO central_log(id,event,value,time,expire) VALUES($1,$2,$3,NOW(),${expire})`,
    [uuid(), event, value],
  );
}

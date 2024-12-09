/*
Send an internal message via cocalc's internal messaging system.
*/

import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { updateUnreadMessageCount } from "@cocalc/database/postgres/messages";
import basePath from "@cocalc/backend/base-path";
import { join } from "path";
import type { Message } from "@cocalc/util/db-schema/messages";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import { getSupportAccountId } from "./support-account";

export async function name(account_id: string) {
  const { name: name0, email_address } = await getUser(account_id);
  return `${name0} <${email_address}>`;
}

export default async function send({
  to_ids,
  from_id,
  subject,
  body,
  reply_id,
}: {
  // account_id's of user (or users) to send the message to.
  to_ids: string[];
  // message comes from this -- if not set, then the support_account_id in server settings is used.  If that's not setup, then its an error.
  from_id?: string;
  // short plain text formatted subject
  subject: string;
  // longer markdown formatted body
  body: string;
  // optional message id to reply to.  We do NOT enforce any consistency on the subject
  // being the same as what is being replied to, to avoid subtle security model issues.
  reply_id?: number;
}) {
  if (to_ids?.length == 0) {
    // nothing to do
    return;
  }
  for (const account_id of to_ids) {
    // validate targets
    if (!(await isValidAccount(account_id))) {
      throw Error(`invalid account_id -- ${account_id}`);
    }
  }
  // validate sender -- if not given, assumed internal and tries to send
  // from support or an admin
  if (!from_id) {
    from_id = await getSupportAccountId();
  }
  if (!from_id) {
    // this should be impossible, but just in case.
    from_id = to_ids[0];
  }
  if (!(await isValidAccount(from_id))) {
    throw Error(`invalid from_id account_id -- ${from_id}`);
  }

  const pool = getPool();
  let thread_id;
  if (reply_id) {
    const { rows: replyRows } = await pool.query(
      "SELECT thread_id FROM messages WHERE id=$1",
      [reply_id],
    );
    if (replyRows.length == 0) {
      // no-op: message no longer exists; maybe deleted
      thread_id = null;
    } else {
      thread_id = replyRows[0].thread_id ?? reply_id;
    }
  }

  // create the message
  const { rows } = await pool.query(
    "INSERT INTO messages(from_id,to_ids,subject,body,sent,thread_id) VALUES($1,$2,$3,$4,NOW(),$5) RETURNING id",
    [from_id, to_ids, subject, body, thread_id],
  );
  const { id } = rows[0];
  if (process.env.COCALC_TEST_MODE) {
    // In testing mode, we also push emails into an in-memory list.  The test framework can then check to see
    // what happened, reset it, etc.  Testing could alternatively look in the database, but this is simpler,
    // synchronous (instead of async) and much faster.
    testMessages.push({ id, from_id, to_ids, subject, body, thread_id });
  }

  for (const account_id of to_ids) {
    await updateUnreadMessageCount({ account_id });
  }
  return id;
}

export async function support() {
  const { help_email, site_name } = await getServerSettings();
  const help = help_email
    ? ` email us at [${help_email}](mailto:${help_email}), `
    : "";
  return `\n\n---\n\nThank you for using and supporting ${site_name}! If you have questions, reply to this message, ${help}
or [create a support ticket](${await url("support", "new")}).\n\n---\n\n`;
}

// Given a URL like /support/new, this returns something like https://cocalc.com/support/new,
// but for this site.   url("support", "new")
export async function url(...args) {
  const { dns } = await getServerSettings();
  return `https://${dns}${join(basePath, ...args.map((x) => `${x}`))}`;
}

export const testMessages: Message[] = [];
export async function resetTestMessages() {
  testMessages.length = 0;
}

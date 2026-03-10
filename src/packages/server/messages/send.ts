/*
Send an internal message via cocalc's internal messaging system.
*/

import { join } from "path";
import { getLogger } from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { updateUnreadMessageCount } from "@cocalc/database/postgres/changefeed/messages";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { getUser } from "@cocalc/server/purchases/statements/email-statement";
import type { Message } from "@cocalc/util/db-schema/messages";
import { getSupportAccountId } from "./support-account";
import siteUrl from "@cocalc/server/hub/site-url";

const logger = getLogger("server:messages:send");

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
  dedupMinutes,
}: {
  // account_id's of user (or users) to send the message to.
  to_ids: string[];
  // message comes from this -- if not set, then the support_account_id in server settings
  // is used and dedupMinutes is set to 60 (if not given).  If support account is not setup
  // then it gets automatically created.
  from_id?: string;
  // short plain text formatted subject
  subject: string;
  // longer markdown formatted body
  body: string;
  // optional message id to reply to.  We do NOT enforce any consistency on the subject
  // being the same as what is being replied to, to avoid subtle security model issues.
  reply_id?: number;
  // if given and nonzero, attempts to send an identical message (with identical from and to)
  // within this interval of time is ignored.  Very useful for system notifications.
  dedupMinutes?: number;
}) {
  logger.debug("send a message");
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
    dedupMinutes = dedupMinutes ?? 5 * 60;
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

  if (dedupMinutes) {
    const id = await getRecentMessage({
      to_ids,
      from_id,
      subject,
      body,
      thread_id,
      maxAgeMinutes: dedupMinutes,
    });
    if (id != null) {
      logger.debug(`message is duplicate of id=${id}`);
      return id;
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

  updateUnread(to_ids); // don't block on this...
  return id;
}

async function updateUnread(account_ids) {
  for (const account_id of account_ids) {
    try {
      await updateUnreadMessageCount({ account_id });
    } catch (err) {
      logger.debug(`issue updating unread message count: ${err}`);
    }
  }
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
  return await siteUrl(join(...args.map((x) => `${x}`)));
}

export const testMessages: Message[] = [];
export async function resetTestMessages() {
  testMessages.length = 0;
}

// We implement this as a database query instead of in memory TTL cache,
// since we need it to work across potentially many servers.
export async function getRecentMessage({
  to_ids,
  from_id,
  subject,
  body,
  thread_id,
  maxAgeMinutes,
}): Promise<number | undefined> {
  const pool = getPool();
  const query = `
  SELECT id FROM messages where
      to_ids=$1 AND from_id=$2 AND subject=$3 AND body=$4 AND coalesce(thread_id,0)=$5 AND
      sent >= NOW()-interval '${parseInt(maxAgeMinutes)} minutes'`;
  const { rows } = await pool.query(query, [
    to_ids,
    from_id,
    subject,
    body,
    thread_id ?? 0,
  ]);
  return rows[0]?.id;
}

import getPool from "@cocalc/database/pool";
import { getLogger } from "@cocalc/backend/logger";
import sendEmail from "@cocalc/server/email/send-email";
import { getServerSettings } from "@cocalc/database/settings";
import { plural } from "@cocalc/util/misc";
import basePath from "@cocalc/backend/base-path";
import { join } from "path";
import markdownit from "markdown-it";
import { getNames } from "@cocalc/server/accounts/get-name";

const log = getLogger("server:messages:maintenance");

const HOUR = 1000 * 60 * 60; // hour in ms

// once ~ every hour, we purge mutually expired messages.
// The actual delete shouldn't take long.
const DELETE_EXPIRED_MESSAGES_INTERVAL_MS = 0.9 * HOUR;

// Periodically we send email summaries to users
// with new unread messages, for which we have NOT
// sent a summary too recently.
const SEND_EMAIL_SUMMARY_INTERVAL_MS = 31 * HOUR;

// For now, we'll try once every hours.  It means you have to
// wait up to one hour to get an email notification of a new message.
const MIN_INTERVAL_BETWEEN_SUMMARIES_MS = HOUR;

export default async function initMaintenance() {
  log.debug("initMaintenance", {
    DELETE_EXPIRED_MESSAGES_INTERVAL_MS,
    SEND_EMAIL_SUMMARY_INTERVAL_MS,
    MIN_INTERVAL_BETWEEN_SUMMARIES_MS,
  });
  setInterval(deleteExpiredMessages, DELETE_EXPIRED_MESSAGES_INTERVAL_MS);
  setInterval(sendAllEmailSummaries, SEND_EMAIL_SUMMARY_INTERVAL_MS);
}

export async function deleteExpiredMessages() {
  // periodically delete messages that are marked for deletion
  // We can't just use the built in "expire" feature, where any table with an expire column
  // gets is entries deleted, since a message should ONLY be deleted if both to_expire and
  // from_expire are set and in the past.  This is because both the sender and the recipient
  // of a message have to decide to permanently delete it before it is permanently deleted,
  // since there is only one copy of each sent message (unlike email which has at least two).

  log.debug("maintainDeleteExpiredMessages: checking...");
  try {
    const pool = getPool();
    // this gets every message where the sender and all recipients have elected to permanently
    // delete the message.  In that case, we delete it.
    // There's one other case, which is a draft message (hence sent is null), in which case
    // we only require the author to expire the message.
    const result = await pool.query(
      `
      DELETE FROM messages WHERE
               expire = REPEAT('1', array_length(to_ids, 1) + 1)::bit varying
           OR (sent IS NULL AND substring(expire,1,1) = '1'::bit(1))
      `,
    );
    const deletedCount = result.rowCount;
    log.debug(
      "maintainDeleteExpiredMessages: deleted",
      deletedCount,
      "messages",
    );
  } catch (err) {
    log.debug(`maintainDeleteExpiredMessages: error -- ${err}`);
  }
}

// if user has an email on file, send out an email about their new unread messages.
export async function sendAllEmailSummaries() {
  log.debug("sendAllEmailSummaries");

  try {
    // we only make the verify condition if verification is enabled on the site.
    // E.g., an onprem site might have a small group of trusted users where their
    // email is all fine and doesn't need verify.
    const { verify_emails, email_enabled } = await getServerSettings();
    if (!email_enabled) {
      log.debug(
        "sendAllEmailSummaries: Email sending enabled is false, so skipping",
      );
      return;
    }

    // For each user with verified email and at least 1 unread message and
    // who we haven't contacted since MIN_INTERVAL_BETWEEN_SUMMARIES_MS,
    // and having a message that was **RECENTLY RECEIVED** (i.e., the sent field is recent),
    // we send them a message... unless they have other_settings.no_email_new_messages
    // set to true (i.e., they disabled messages).  We also only email users with
    // verified email accounts, assuming verification is setup.
    const pool = getPool();
    const query = `
SELECT a.account_id, a.first_name, a.last_name, a.unread_message_count,
       a.email_address_verified, a.email_address,
       ARRAY_AGG(m.id) AS message_ids,
       ARRAY_AGG(m.from_id) AS message_from_ids,
       ARRAY_AGG(m.subject) AS message_subjects,
       ARRAY_AGG(m.body) AS message_bodies
FROM accounts a
JOIN messages m ON a.account_id = ANY(m.to_ids)
WHERE a.unread_message_count > 0
AND (a.last_message_summary IS NULL OR a.last_message_summary <= NOW() - interval '${MIN_INTERVAL_BETWEEN_SUMMARIES_MS / 1000} seconds') ${verify_emails ? "AND a.email_address_verified IS NOT NULL" : ""}
AND a.email_address IS NOT NULL
AND m.sent >= NOW() - interval '${MIN_INTERVAL_BETWEEN_SUMMARIES_MS / 1000} seconds'
AND coalesce((a.other_settings#>'{no_email_new_messages}')::boolean, false) = false
GROUP BY a.account_id,
         a.first_name,
         a.last_name,
         a.unread_message_count,
         a.email_address_verified,
         a.email_address`;

    const { rows } = await pool.query(query);
    log.debug(
      "sendAllEmailSummaries: got ",
      rows.length,
      "users to notify via verified email",
    );
    if (rows.length == 0) {
      return;
    }

    for (const {
      account_id,
      first_name,
      last_name,
      unread_message_count,
      email_address_verified,
      email_address,
      message_ids,
      message_from_ids,
      message_subjects,
      message_bodies,
    } of rows) {
      const email = getEmailAddress({
        email_address_verified,
        email_address,
      });
      if (!email) {
        log.debug(
          `sendAllEmailSummaries: no email for ${account_id}, ${first_name}, ${last_name} so skipping`,
        );
        continue;
      }
      const messages: {
        id: number;
        subject: string;
        body: string;
        from_id: string;
      }[] = [];
      let i = 0;
      for (const id of message_ids) {
        const subject = message_subjects[i];
        const body = message_bodies[i];
        const from_id = message_from_ids[i];
        messages.push({ id, subject, body, from_id });
        i += 1;
      }
      await sendEmailSummary({
        account_id,
        first_name,
        last_name,
        unread_message_count,
        email,
        messages,
      });
    }

    // now mark everybody as notified -- if something failed, they will just have to wait until next time.
    await pool.query(
      "UPDATE accounts SET last_message_summary=NOW() WHERE account_id=ANY($1)",
      [rows.map(({ account_id }) => account_id)],
    );
  } catch (err) {
    log.debug(`sendAllEmailSummaries: error -- ${err}`);
  }
}

function getEmailAddress({ email_address_verified, email_address }) {
  return email_address_verified?.[email_address]
    ? email_address
    : Object.keys(email_address_verified ?? { [email_address]: true })[0];
}

export async function sendEmailSummary({
  account_id,
  first_name,
  last_name,
  email,
  unread_message_count,
  messages,
}) {
  try {
    log.debug(
      `sendEmailSummary for ${account_id}, ${first_name}, ${last_name} to ${email}`,
    );

    const name = `${first_name} ${last_name}`;

    const {
      help_email: from,
      site_name: siteName,
      dns,
    } = await getServerSettings();
    const url = `https://${dns}${join(basePath, "notifications#page=messages-inbox")}`;
    const signIn = `https://${dns}${join(basePath, "auth", "sign-in")}`;

    const subject = `${unread_message_count} unread ${siteName} ${plural(unread_message_count, "message")}`;

    const names0 = await getNames(messages.map(({ from_id }) => from_id));
    const names: { [account_id: string]: string } = {};
    for (const account_id in names0) {
      const { first_name, last_name } = names0[account_id];
      names[account_id] = `${first_name} ${last_name}`;
    }

    const html = `
Hello ${name},
<br/>
<br/>
You have ${subject}.  To read them, visit the <a href="${url}">${siteName}</a>
message center</a> after <a href="${signIn}">signing in to ${siteName}</a>,
or read them below.    You can disable these email alerts under Messaging Settings
in your <a href="${url}/settings/account">account settings</a>.
<br/>
<br/>
 - ${siteName}
<br/>
<br/>
${messages.map((message) => messageToHtml(message, url, names)).join("<br/><hr/></br>")}
`;

    const text = `
Hello ${name},

You have ${subject}.  To read and respond to them, visit the message center at

${url}

after signing in to ${siteName} at

${signIn}

or read them below.  You can disable these email alerts under Messaging Settings
at ${url}/settings/account

 - ${siteName}

 ${messages.map((message) => messageToText(message, url, names)).join("\n\n---\n\n")}


`;

    console.log(text);
    await sendEmail({ from, to: email, subject, html, text });
  } catch (err) {
    log.debug(`sendEmailSummary: error -- ${err}`);
  }
}

function messageToHtml({ from_id, subject, body, id }, url, names) {
  const md = markdownit();
  return `
<a href="${url}&id=${id}">From: ${names[from_id]}<br/>
Subject: ${subject}</a><br/>

${md.render(body)}
  `;
}

function messageToText({ from_id, subject, body, id }, url, names) {
  return `
URL: ${url}&id=${id}
From: ${names[from_id]}
Subject: ${subject}

${body}
  `;
}

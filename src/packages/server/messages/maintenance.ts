import getPool from "@cocalc/database/pool";
import { getLogger } from "@cocalc/backend/logger";
import sendEmail from "@cocalc/server/email/send-email";
import { getServerSettings } from "@cocalc/database/settings";
import { plural } from "@cocalc/util/misc";
import markdownit from "markdown-it";
import { getNames } from "@cocalc/server/accounts/get-name";
import get from "./get";
import adminAlert from "@cocalc/server/messages/admin-alert";
import siteUrl from "@cocalc/server/hub/site-url";

const log = getLogger("server:messages:maintenance");

const HOUR = 1000 * 60 * 60; // hour in ms

// We periodically purge mutually expired messages.
// The actual delete shouldn't take long.  No need to do
// this frequently since it is invisible to users.  It's
// just to save space.
const DELETE_EXPIRED_MESSAGES_INTERVAL_MS = 12.1 * HOUR;

// Every this often, if a user has new messages that they haven't seen
// in the app, we send them an email with those messages and a link.
const SEND_EMAIL_SUMMARY_INTERVAL_MS = 0.9 * HOUR;

export default async function initMaintenance() {
  log.debug("initMaintenance", {
    DELETE_EXPIRED_MESSAGES_INTERVAL_MS,
    SEND_EMAIL_SUMMARY_INTERVAL_MS,
  });
  deleteExpiredMessages();
  setInterval(deleteExpiredMessages, DELETE_EXPIRED_MESSAGES_INTERVAL_MS);
  sendAllEmailSummaries();
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

// if user has an email on file, send out an email about their new unread messages
// since last time this was called.
// It's VERY VERY unlikely that something gets missed, but it's not totally impossible.
// I think the one case where a notification could be lost is if a message is sent by a user
// EXACTLY when we're doing notifications, and their clock is slightly off. All system messages
// use the database clock, so should be fine.
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

    // For each user with verified email and at least 1 unread message,
    // and having a message that was **RECENTLY RECEIVED** (i.e.,
    // the sent field is more recent than last time they were notified),
    // we send them a message... unless they have other_settings.no_email_new_messages
    // set to true (i.e., they disabled messages).  We also only email users with
    // verified email accounts, assuming verification is setup.
    // The hardcoded "1 week" below is just assuming that this service isn't down for more than a week.
    const pool = getPool();
    const query = `
SELECT a.account_id, a.first_name, a.last_name, a.unread_message_count,
       a.email_address_verified, a.email_address, a.last_message_summary
FROM accounts a
JOIN messages m ON a.account_id = ANY(m.to_ids)
WHERE a.unread_message_count > 0
${verify_emails ? "AND a.email_address_verified IS NOT NULL" : ""}
AND a.email_address IS NOT NULL
AND m.sent > coalesce(a.last_message_summary, NOW() - interval '1 week')
AND coalesce((a.other_settings#>'{no_email_new_messages}')::boolean, false) = false
GROUP BY a.account_id,
         a.first_name,
         a.last_name,
         a.unread_message_count,
         a.email_address_verified,
         a.email_address,
         a.last_message_summary`;

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
      email_address_verified,
      email_address,
      last_message_summary,
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
      await sendEmailSummary({
        account_id,
        first_name,
        last_name,
        email,
        last_message_summary,
      });
    }
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
  last_message_summary,
}) {
  try {
    log.debug(
      `sendEmailSummary for ${account_id}, ${first_name}, ${last_name} to ${email}`,
    );

    const messages = await get({
      account_id,
      type: "new",
      cutoff: last_message_summary,
    });

    log.debug(`sendEmailSummary: got ${messages.length} new messages`);
    if (messages.length == 0) {
      const pool = getPool();
      await pool.query(
        "UPDATE accounts SET last_message_summary=NOW() WHERE account_id=$1",
        [account_id],
      );
      return;
    }

    const name = `${first_name} ${last_name}`;

    const { help_email: from, site_name: siteName } = await getServerSettings();
    const settings = await siteUrl("settings/account");
    const url = await siteUrl("notifications#page=messages-inbox");
    const signIn = await siteUrl("auth/sign-in");

    const num = messages.length <= 1 ? "" : ` (${messages.length})`;
    const subject = `Unread ${siteName} ${plural(messages.length, "message")}${num}`;

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
You have ${subject}.  To read them, visit the <a href="${url}">${siteName}
message center</a> after <a href="${signIn}">signing in to ${siteName}</a>.
The new ones we haven't sent you are below:
<br/>
<br/>
 - ${siteName} (you can disable email alerts in <a href="${settings}">account settings</a>)
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

or read them below.  You can disable these email alerts under Message Settings at

${settings}


 - ${siteName}

 ${messages.map((message) => messageToText(message, url, names)).join("\n\n---\n\n")}

`;

    await sendEmail({ from, to: email, subject, html, text });
    // newest is always first and message list is nonempty.
    const newestMessageTime = messages[0].sent;
    if (newestMessageTime != null) {
      // Due to rounding, we always add 1 second. Yes, you can mutate
      // a Date object by doing this, and it does wrap around properly.
      newestMessageTime.setSeconds(newestMessageTime.getSeconds() + 1);
      if (
        last_message_summary == null ||
        last_message_summary < newestMessageTime
      ) {
        // now mark as notified -- if something failed above, this doesn't happen,
        // so we will retry again next time.
        const pool = getPool();
        await pool.query(
          "UPDATE accounts SET last_message_summary=$2 WHERE account_id=$1",
          [account_id, newestMessageTime],
        );
      }
    }
  } catch (err) {
    log.debug(`sendEmailSummary: error -- ${err}`);
    adminAlert({
      stackTrace: true,
      subject: `Unexpected BUG/ERROR sending email summary to a user -- please investigate`,
      body: `
An unexpected bug occurred trying to send an email summary.  An admin should investigate.

${JSON.stringify({
  account_id,
  first_name,
  last_name,
  email,
  last_message_summary,
})}

${err}
`,
    });
  }
}

function messageToHtml({ from_id, subject, body, id }, url, names) {
  const md = markdownit({
    html: true,
    linkify: true,
    typographer: true,
  });
  return `
<h2><a href="${url}&id=${id}">Subject: ${subject}</a></h2>
From: ${names[from_id]}<br/>
<br/>

${md.render(body)}
  `;
}

function messageToText({ from_id, subject, body, id }, url, names) {
  return `
URL: ${url}&id=${id}
Subject: ${subject}
From: ${names[from_id]}

${body}
  `;
}

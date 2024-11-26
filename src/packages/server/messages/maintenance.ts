import getPool from "@cocalc/database/pool";

const HOUR = 1000 * 60 * 60; // hour in ms

// once every hour, we purge mutually expired messages.
// The actual delete shouldn't take long.
const DELETE_EXPIRED_MESSAGES_INTERVAL_MS = HOUR;

// Once every hour, we send email summaries to users
// with new unread messages, for which we have NOT
// sent a summary in the last day.
const SEND_EMAIL_SUMMARY_INTERVAL_MS = HOUR;
const MIN_INTERVAL_BETWEEN_SUMMARIES_MS = 24 * HOUR; // one day

export default async function initMaintenance() {
  setInterval(
    maintainDeleteExpiredMessages,
    DELETE_EXPIRED_MESSAGES_INTERVAL_MS,
  );
  setInterval(maintainSendEmailSummary, SEND_EMAIL_SUMMARY_INTERVAL_MS);
}

async function maintainDeleteExpiredMessages() {
  // periodically delete messages that are marked for deletion
  // We can't just use the built in "expire" feature, where any table with an expire column
  // gets is entries deleted, since a message should ONLY be deleted if both to_expire and
  // from_expire are set and in the past.  This is because both the sender and the recipient
  // of a message have to decide to permanently delete it before it is permanently deleted,
  // since there is only one copy of each sent message (unlike email which has at least two).
}

// if user has an email on file, send out an email about their new unread messages.
async function maintainSendEmailSummary() {}

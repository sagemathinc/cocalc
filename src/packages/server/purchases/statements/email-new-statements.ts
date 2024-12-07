/*
Send email for each statement that was created in the last 24 hours, and for which
we have no yet attempted to send out an email.

- For monthly statements we always try to send them out.
- For daily statements, we check whether or not the account has daily statements disabled.
*/

import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import emailStatement from "./email-statement";

const logger = getLogger("purchases:email-new-statements");

export default async function emailNewStatements() {
  logger.debug("emailNewStatements");
  const statements = await getRecentStatements();
  logger.debug("considering ", statements.length, " new statements");
  const emailDaily: { [account_id: string]: boolean } = {};
  for (const statement of statements) {
    try {
      if (statement.interval == "month") {
        // always send monthly statement
        await emailStatement({
          statement_id: statement.id,
          account_id: statement.account_id,
          dryRun: false,
          force: false,
        });
      } else if (statement.interval == "day") {
        // only send day if user doesn't have sending daily statements disabled
        if (emailDaily[statement.account_id] == null) {
          emailDaily[statement.account_id] = await getEmailDaily(
            statement.account_id,
          );
        }
        if (emailDaily[statement.account_id]) {
          await emailStatement({
            statement_id: statement.id,
            account_id: statement.account_id,
            dryRun: false,
            force: false,
          });
        }
      }
    } catch (err) {
      // it is possible that we can't send some statements via email, e.g., if the
      // user has no email address, then emailStatement would throw.  Or maybe
      // there is just a temporary network issue.
      logger.debug(
        `WARNING: Nonfatal error emailing out one new statement -- ${err}`,
      );
    }
  }
}

async function getRecentStatements() {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT id, interval, account_id FROM statements WHERE time >= NOW() - interval '1 day' AND last_sent IS NULL",
  );
  return rows;
}
// email_daily_statements
async function getEmailDaily(account_id: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_daily_statements FROM accounts WHERE account_id=$1",
    [account_id],
  );
  return !!rows[0].email_daily_statements;
}

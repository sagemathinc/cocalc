import getPool from "@cocalc/database/pool";
import getName from "@cocalc/server/accounts/get-name";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";

export async function disableDailyStatements(account_id: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_daily_statements FROM accounts WHERE account_id=$1",
    [account_id]
  );
  let email_daily_statements = !!rows[0]?.email_daily_statements;
  await pool.query(
    "UPDATE accounts SET email_daily_statements = $1 WHERE account_id=$2",
    [!email_daily_statements, account_id]
  );
  if (email_daily_statements) {
    return {
      text: `Disabled sending daily statements for ${await getName(
        account_id
      )}. Daily statements will still be created and can be viewed in [the statements page](/settings/statements).`,
    };
  } else {
    return {
      text: `Enabled sending daily statements for ${await getName(
        account_id
      )}.`,
    };
  }
}

export async function extraInfo(description) {
  const { account_id } = description;
  const name = await getName(account_id);
  const email = await getEmailAddress(account_id);

  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT email_daily_statements FROM accounts WHERE account_id=$1",
    [account_id]
  );
  let email_daily_statements = !!rows[0]?.email_daily_statements;
  if (!email_daily_statements) {
    // already disabled
    return {
      ...description,
      title: `Enable Emailing Daily Statements`,
      details: `Emailing daily statements to ${name} at ${email} are currently disabled.  Would you like to enable them?
\n\n- ${name} will still receive *monthly statements* at ${email}.
\n\n- Daily statements can always be [viewed in the statements page](/settings/statements).`,
      okText: "Enable Sending Daily Statements",
      icon: "calendar",
    };
  }

  return {
    ...description,
    title: `Stop Emailing Daily Statements`,
    details: `Would you like to disable emailing daily statements to ${name} at ${email}?
\n\n- ${name} will still receive *monthly statements* at ${email}.
\n\n- Daily statements will also still be created and can be [viewed in the statements page](/settings/statements).`,
    okText: "Stop Sending Daily Statements",
    icon: "calendar",
  };
}

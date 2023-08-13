import getPool from "@cocalc/database/pool";
import getName from "@cocalc/server/accounts/get-name";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";

export async function disableDailyStatements(account_id: string) {
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET email_daily_statements=false WHERE account_id=$1",
    [account_id]
  );
  return {
    text: `Disabled sending daily statements for ${await getName(
      account_id
    )}. Daily statements will also still be created and [can be viewed in the statements page](/settings/statements).`,
  };
}

export async function extraInfo(description) {
  return {
    ...description,
    title: `Stop Emailing Daily Statements`,
    details: `Would you like to disable emailing daily statements to ${await getName(
      description.account_id
    )} at ${await getEmailAddress(
      description.account_id
    )}? You will still receive *monthly statements* by email.  Daily statements will also still be created and can be [viewed in the statements page](/settings/statements).`,
    okText: "Stop Emailing Daily Statements",
    icon: "calendar",
  };
}

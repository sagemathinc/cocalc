import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

export interface QuotaDescription {
  quota: number;
  why: string;
  increase: "account" | "support" | "verify-email" | "credit"; // used in frontend ui, so don't change willy nilly!
}

// This is the overall max quota for the user, called the "Spending Limit" in the UI.
export default async function getQuota(
  account_id: string
): Promise<QuotaDescription> {
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT purchase_quota, email_address_verified, email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    return {
      quota: 0,
      why: "Invalid account.",
      increase: "account",
    };
  }
  const { purchase_quota, email_address_verified, email_address } = rows[0];
  if (purchase_quota) {
    // a quota that was set by an admin, etc.
    return {
      quota: purchase_quota,
      why: "This limit was set by an administrator.",
      increase: "support",
    };
  }

  const {
    pay_as_you_go_spending_limit,
    pay_as_you_go_spending_limit_with_verified_email,
    pay_as_you_go_spending_limit_with_credit,
    verify_emails,
  } = await getServerSettings();

  if (await hasCredit(account_id)) {
    return {
      quota: pay_as_you_go_spending_limit_with_credit,
      why: "Account received a payment. Thanks!",
      increase: "support",
    };
  }

  if (verify_emails && !email_address_verified?.[email_address]) {
    return {
      quota: pay_as_you_go_spending_limit,
      why: "Your email address is not verified.",
      increase: "verify-email",
    };
  }
  return {
    quota: pay_as_you_go_spending_limit_with_verified_email,
    why: "Make a payment to increase your spending limit.",
    increase: "credit",
  };
}

async function hasCredit(account_id: string) {
  const pool = getPool("long");
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM purchases WHERE account_id=$1 AND service='credit'",
    [account_id]
  );
  return rows[0].count > 0;
}

// Allow admin to get quota of another user.
export async function adminGetQuota({
  admin_id,
  account_id,
}: {
  admin_id: string;
  account_id: string;
}): Promise<QuotaDescription> {
  if (!(await userIsInGroup(admin_id, "admin"))) {
    throw Error("must be an admin");
  }
  return await getQuota(account_id);
}

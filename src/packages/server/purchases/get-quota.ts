import getPool from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

export interface QuotaDescription {
  quota: number;
  why: string;
  increase: "account" | "support" | "add-card" | "verify-email"; // used in frontend ui, so don't change willy nilly!
}

// This is the overall max quota for the user.   Their
// quota for each service is also bounded by this value.
export default async function getQuota(
  account_id: string
): Promise<QuotaDescription> {
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT purchase_quota, stripe_customer#>'{sources,data}' as stripe_sources, email_address_verified, email_address FROM accounts WHERE account_id=$1",
    [account_id]
  );
  if (rows.length == 0) {
    return {
      quota: 0,
      why: "Invalid account.",
      increase: "account",
    };
  }
  const {
    purchase_quota,
    stripe_sources,
    email_address_verified,
    email_address,
  } = rows[0];
  if (purchase_quota) {
    // a quota that was set by an admin, etc.
    return {
      quota: purchase_quota,
      why: "This is a quota set by an admin or the system.",
      increase: "support",
    };
  }
  if (!hasValidCard(stripe_sources)) {
    // if no stripe credit card on file that passes a check, so definitely no purchases allowed.
    return {
      quota: 0,
      why: "You have no credit card on file that passes a check.  Add a valid credit card.",
      increase: "add-card",
    };
  }
  const { default_pay_as_you_go_quota, verify_emails } =
    await getServerSettings();
  if (verify_emails && !email_address_verified?.[email_address]) {
    return {
      quota: 0,
      why: "Your email is not verified. Verify your email to increase your quota.",
      increase: "verify-email",
    };
  }
  return {
    quota: default_pay_as_you_go_quota,
    why: "This is the default starting quota for verified users with a card on file.",
    increase: "support",
  };
}

function hasValidCard(stripe_sources) {
  if (!stripe_sources || stripe_sources.length == 0) {
    // if no stripe credit card on file, then definitely no purchases allowed.
    return false;
  }
  for (const source of stripe_sources) {
    if (source.cvc_check == "pass") {
      // have a card and it passes the cvc check
      return true;
    }
  }
  return false;
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

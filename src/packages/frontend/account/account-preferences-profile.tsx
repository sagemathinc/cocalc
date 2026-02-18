/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { IconName } from "@cocalc/frontend/components/icon";

import { useTypedRedux } from "@cocalc/frontend/app-framework";

import { ProfileSettings } from "./profile-settings";
import { AccountSettings } from "./settings/account-settings";

// Icon constant for account preferences section
export const ACCOUNT_PROFILE_ICON_NAME: IconName = "address-card";

export const ACCOUNT_PREFERENCES_ICON_NAME: IconName = "cogs";

export function AccountPreferencesProfile() {
  const account_id = useTypedRedux("account", "account_id");
  const first_name = useTypedRedux("account", "first_name");
  const last_name = useTypedRedux("account", "last_name");
  const name = useTypedRedux("account", "name");
  const email_address = useTypedRedux("account", "email_address");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified",
  );
  const passports = useTypedRedux("account", "passports");
  const sign_out_error = useTypedRedux("account", "sign_out_error");
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const created = useTypedRedux("account", "created");
  const strategies = useTypedRedux("account", "strategies");
  const unlisted = useTypedRedux("account", "unlisted");
  const email_enabled = useTypedRedux("customize", "email_enabled");
  const verify_emails = useTypedRedux("customize", "verify_emails");

  return (
    <div role="region" aria-label="Profile settings">
      <AccountSettings
        account_id={account_id}
        first_name={first_name}
        last_name={last_name}
        name={name}
        email_address={email_address}
        email_address_verified={email_address_verified}
        passports={passports}
        sign_out_error={sign_out_error}
        other_settings={other_settings}
        is_anonymous={is_anonymous}
        email_enabled={email_enabled}
        verify_emails={verify_emails}
        created={created}
        strategies={strategies}
        unlisted={unlisted}
      />
      <ProfileSettings email_address={email_address} />
    </div>
  );
}

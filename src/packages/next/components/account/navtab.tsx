/* The "Account" navigation tab in the bar at the top. */
import { join } from "path";
import { LinkStyle } from "components/landing/header";
import basePath from "lib/base-path";
import Avatar from "components/account/avatar";
import { useCustomize } from "lib/customize";

export default function AccountNavTab() {
  const { account } = useCustomize();
  if (!account) return null;
  return (
    <a
      style={LinkStyle}
      href={join(basePath, "settings")}
      title={"View your Account Settings"}
    >
      {/* The negative margin fixes some weird behavior that stretches header. */}
      {account.account_id && (
        <>
          <Avatar
            account_id={account.account_id}
            style={{ margin: "-10px 0" }}
          />
          &nbsp;&nbsp;
        </>
      )}
      Account
    </a>
  );
}

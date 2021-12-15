/* The "Account" navigation tab in the bar at the top. */
import { Menu, Dropdown } from "antd";
import { join } from "path";
import { LinkStyle } from "components/landing/header";
import basePath from "lib/base-path";
import Avatar from "components/account/avatar";
import { useCustomize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import useProfile from "lib/hooks/profile";

export default function AccountNavTab() {
  const { account, siteName } = useCustomize();
  const profile = useProfile(account.account_id);
  if (!account) return null;

  const profile_url = profile?.name
    ? `/${profile.name}`
    : `/share/accounts/${account?.account_id}`;
  const menu = (
    <Menu>
      {profile && (
        <>
          <Menu.Item>
            <A href={profile_url}>
              Signed into {siteName} as
              <br />
              <b>
                {profile.first_name} {profile.last_name}
                {profile.name ? ` (@${profile.name})` : ""}
              </b>
            </A>
          </Menu.Item>
          <Menu.Divider />
        </>
      )}
      <Menu.Item icon={<Icon name="book" />}>
        <A href="https://doc.cocalc.com" external>
          Documentation...
        </A>
      </Menu.Item>
      <Menu.Item icon={<Icon name="user" />}>
        <A href="/config/search/input">Settings</A>
      </Menu.Item>
      <Menu.Divider />

      <Menu.Item icon={<Icon name="key" />}>
        <A href={join(basePath, "settings", "licenses")} external>
          Your Licenses...
        </A>
      </Menu.Item>
      <Menu.Item icon={<Icon name="credit-card" />}>
        <A href={join(basePath, "settings", "billing")} external>
          Your Purchases...
        </A>
      </Menu.Item>
      <Menu.Item icon={<Icon name="key" />}>
        <A href={join(basePath, "settings", "ssh-keys")} external>
          Your SSH keys...
        </A>
      </Menu.Item>
      <Menu.Item icon={<Icon name="key" />}>
        <A href={join(basePath, "projects")} external>
          Your Projects...
        </A>
      </Menu.Item>
      <Menu.Item icon={<Icon name="bullhorn" />}>
        <A
          href={
            profile?.name
              ? `/${profile.name}`
              : `/share/accounts/${account?.account_id}`
          }
        >
          Your Shared Files
        </A>
      </Menu.Item>
      <Menu.Divider />

      <Menu.Item icon={<Icon name="sign-out-alt" />}>
        <A href="/config/account/sign-out">Sign Out</A>
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={"click" as "click"}>
      <div
        style={{ ...LinkStyle, cursor: "pointer" }}
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
        Account <Icon name="angle-down" />
      </div>
    </Dropdown>
  );
}

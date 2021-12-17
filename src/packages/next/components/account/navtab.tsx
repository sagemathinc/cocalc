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
  const { siteName } = useCustomize();
  const profile = useProfile();
  if (!profile) return null;

  const { first_name, last_name, name, account_id, is_admin, is_anonymous } =
    profile;

  const profile_url = name ? `/${name}` : `/share/accounts/${account_id}`;

  const menu = (
    <Menu>
      {profile && (
        <>
          <Menu.Item>
            <A href={profile_url}>
              Signed into {siteName} as
              <br />
              <b>
                {first_name} {last_name}
                {name ? ` (@${name})` : ""}
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
      <Menu.Item
        icon={<Icon name="user" />}
        style={
          is_anonymous
            ? { background: "#fffbe6", border: "1px solid orange" }
            : undefined
        }
      >
        <A href="/config/search/input">
          {is_anonymous ? <b>Sign Up (save your work)!</b> : "Account Configuration"}
        </A>
      </Menu.Item>
      <Menu.Divider />

      {!is_anonymous && (
        <Menu.Item icon={<Icon name="key" />}>
          <A href={join(basePath, "settings", "licenses")} external>
            Your Licenses...
          </A>
        </Menu.Item>
      )}
      {!is_anonymous && (
        <Menu.Item icon={<Icon name="credit-card" />}>
          <A href={join(basePath, "settings", "billing")} external>
            Your Purchases...
          </A>
        </Menu.Item>
      )}
      {!is_anonymous && (
        <Menu.Item icon={<Icon name="key" />}>
          <A href={join(basePath, "settings", "ssh-keys")} external>
            Your SSH keys...
          </A>
        </Menu.Item>
      )}
      <Menu.Item icon={<Icon name="key" />}>
        <A href={join(basePath, "projects")} external>
          {is_anonymous ? "Your Project..." : "Your Projects..."}
        </A>
      </Menu.Item>
      {!is_anonymous && (
        <Menu.Item icon={<Icon name="bullhorn" />}>
          <A
            href={profile?.name ? `/${name}` : `/share/accounts/${account_id}`}
          >
            Your Shared Files
          </A>
        </Menu.Item>
      )}

      {is_admin && (
        <>
          <Menu.Divider />
          <Menu.Item icon={<Icon name="users" />}>
            <A href={join(basePath, "admin")} external>
              Administration...
            </A>
          </Menu.Item>
        </>
      )}

      <Menu.Divider />

      <Menu.Item icon={<Icon name="sign-out-alt" />}>
        <A href="/config/account/sign-out">Sign Out</A>
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={"click" as any}>
      <div style={{ ...LinkStyle, cursor: "pointer" }}>
        {/* The negative margin fixes some weird behavior that stretches header. */}
        {account_id && (
          <>
            <Avatar account_id={account_id} style={{ margin: "-10px 0" }} />
            &nbsp;&nbsp;
          </>
        )}
        Account <Icon name="angle-down" />
      </div>
    </Dropdown>
  );
}

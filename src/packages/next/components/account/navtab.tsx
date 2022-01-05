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
import { CSSProperties } from "react";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";

interface Props {
  style: CSSProperties;
}

export default function AccountNavTab({ style }: Props) {
  const router = useRouter();
  const { isCommercial, siteName, sshGateway } = useCustomize();
  const profile = useProfile();
  if (!profile) return null;

  const { first_name, last_name, name, account_id, is_admin, is_anonymous } =
    profile;

  const profile_url = name ? `/${name}` : `/share/accounts/${account_id}`;

  const menu = (
    <Menu theme="dark">
      {profile && (
        <>
          <Menu.Item key="signed-in">
            <A href={is_anonymous ? "/config/search/input" : profile_url}>
              Signed into {siteName} as
              <br />
              <b>
                {is_anonymous && <>Anonymous User</>}
                {!is_anonymous && (
                  <>
                    {first_name} {last_name}
                    {name ? ` (@${name})` : ""}
                  </>
                )}
              </b>
            </A>
          </Menu.Item>

          {is_anonymous && (
            <Menu.Item key="sign-up" icon={<Icon name="user" />}>
              <A href="/config/search/input">
                <b>Sign Up (save your work)!</b>
              </A>
            </Menu.Item>
          )}
          <Menu.Item key="docs" icon={<Icon name="book" />}>
            <A href="https://doc.cocalc.com" external>
              Documentation
            </A>
          </Menu.Item>
          {isCommercial && (
            <Menu.Item key="store" icon={<Icon name="shopping-cart" />}>
              <A href="/store">{siteName} Store</A>
            </Menu.Item>
          )}
          <Menu.Divider />

          {!is_anonymous /* color due to a theme bug */ && (
            <Menu.ItemGroup
              key="configuration"
              title={
                <A href="/config/search/input">
                  <span style={{ color: "#a4acb3" }}>
                    <Icon name="wrench" /> Configuration
                  </span>
                </A>
              }
            >
              <Menu.Item key="account" icon={<Icon name="user" />}>
                <A href="/config/account/name">Account</A>
              </Menu.Item>
              <Menu.Item key="editor" icon={<Icon name="edit" />}>
                <A href="/config/editor/appearance">Editor</A>
              </Menu.Item>
              <Menu.Item key="system" icon={<Icon name="gear" />}>
                <A href="/config/system/appearance">System</A>
              </Menu.Item>
            </Menu.ItemGroup>
          )}

          <Menu.Divider />
        </>
      )}
      <Menu.ItemGroup
        key="your"
        title={
          <A href={join(basePath, "app")} external>
            <span style={{ color: "#a4acb3" }}>
              <Icon name="user" /> Your...
            </span>
          </A>
        }
      >
        <Menu.Item key="projects" icon={<Icon name="edit" />}>
          <A href={join(basePath, "projects")} external>
            {is_anonymous ? "Project" : "Projects"}
          </A>
        </Menu.Item>
        {!is_anonymous && isCommercial && (
          <Menu.Item key="licenses" icon={<Icon name="key" />}>
            <A href="/licenses">Licenses</A>
          </Menu.Item>
        )}
        {!is_anonymous && isCommercial && (
          <Menu.Item key="billing" icon={<Icon name="credit-card" />}>
            <A href="/billing">Billing</A>
          </Menu.Item>
        )}
        {!is_anonymous && sshGateway && (
          <Menu.Item key="ssh" icon={<Icon name="key" />}>
            <A href={join(basePath, "settings", "ssh-keys")} external>
              SSH keys
            </A>
          </Menu.Item>
        )}
        {!is_anonymous && (
          <Menu.Item key="shared" icon={<Icon name="bullhorn" />}>
            <A
              href={
                profile?.name ? `/${name}` : `/share/accounts/${account_id}`
              }
            >
              Shared Files
            </A>
          </Menu.Item>
        )}
      </Menu.ItemGroup>
      {is_admin && (
        <>
          <Menu.Divider />
          <Menu.Item key="admin" icon={<Icon name="users" />}>
            <A href={join(basePath, "admin")} external>
              Site Administration
            </A>
          </Menu.Item>
        </>
      )}

      <Menu.Divider />

      <Menu.Item key="sign-out" icon={<Icon name="sign-out-alt" />}>
        <A
          onClick={async () => {
            await apiPost("/accounts/sign-out", { all: false });
            router.push("/");
          }}
        >
          Sign Out
        </A>
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown overlay={menu} trigger={"click" as any}>
      <div style={{ ...LinkStyle, cursor: "pointer", ...style }}>
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

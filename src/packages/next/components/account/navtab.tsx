/* The "Account" navigation tab in the bar at the top. */
import { Icon, isIconName } from "@cocalc/frontend/components/icon";
import type { MenuProps } from "antd";
import { Dropdown, Menu } from "antd";
import Avatar from "components/account/avatar";
import { LinkStyle } from "components/landing/header";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";
import { join } from "path";
import { CSSProperties } from "react";

type MenuItem = Required<MenuProps>["items"][number];

function makeItem(
  key: React.Key,
  label: React.ReactNode,
  icon?: React.ReactNode | string,
  children?: MenuItem[]
): MenuItem {
  if (typeof icon === "string" && isIconName(icon)) {
    icon = <Icon name={icon} />;
  }
  return {
    key,
    icon,
    children,
    label,
  } as MenuItem;
}

function makeGroup(
  key: React.Key,
  label: React.ReactNode,
  children: MenuItem[]
): MenuItem {
  return {
    key,
    children,
    label,
    type: "group",
  } as MenuItem;
}

const DIVIDER = {
  type: "divider",
} as const;

interface Props {
  style: CSSProperties;
}

export default function AccountNavTab({ style }: Props) {
  const router = useRouter();
  const { isCommercial, shareServer, siteName, sshGateway } = useCustomize();
  const profile = useProfile();
  if (!profile) return null;

  const { first_name, last_name, name, account_id, is_admin, is_anonymous } =
    profile;

  const profile_url = name ? `/${name}` : `/share/accounts/${account_id}`;

  const signedIn = makeItem(
    "signed-in",
    <A href={is_anonymous ? "/config/search/input" : profile_url}>
      Signed into {siteName} as
      <br />
      <b>
        {first_name} {last_name}
        {name ? ` (@${name})` : ""}
      </b>
    </A>
  );

  const docs = makeItem(
    "docs",
    <A href="https://doc.cocalc.com" external>
      Documentation
    </A>,
    "book"
  );

  const configuration = makeGroup(
    "configuration",
    <A href="/config/search/input">
      <span style={{ color: "#a4acb3" }}>
        <Icon name="wrench" /> Configuration
      </span>
    </A>,
    [
      makeItem("account", <A href="/config/account/name">Account</A>, "user"),
      makeItem(
        "editor",
        <A href="/config/editor/appearance">Editor</A>,
        "edit"
      ),
      makeItem(
        "system",
        <A href="/config/system/appearance">System</A>,
        "gear"
      ),
    ]
  );

  function profileItems() {
    if (!profile) return [];
    const ret: MenuItem[] = [];
    ret.push(signedIn);
    if (is_anonymous) {
      ret.push(
        makeItem(
          "sign-up",
          <A href="/config/search/input">
            <b>Sign Up (save your work)!</b>
          </A>,
          "user"
        )
      );
    }
    ret.push(docs);
    if (isCommercial) {
      ret.push(makeItem("store", <A href="/store">Store</A>, "shopping-cart"));
    }
    ret.push(DIVIDER);
    ret.push(configuration);
    ret.push(DIVIDER);
    return ret;
  }

  function yourPages(): MenuItem[] {
    const yours: MenuItem[] = [];
    yours.push(
      makeItem(
        "projects",
        <A href={join(basePath, "projects")} external>
          {is_anonymous ? "Project" : "Projects"}
        </A>,
        "edit"
      )
    );

    if (!is_anonymous) {
      yours.push(makeItem("licenses", <A href="/licenses">Licenses</A>, "key"));

      if (isCommercial) {
        yours.push(
          makeItem("billing", <A href="/billing">Billing</A>, "credit-card")
        );
      }
      if (sshGateway) {
        yours.push(
          makeItem(
            "ssh",
            <A href={join(basePath, "settings", "ssh-keys")} external>
              SSH keys
            </A>,
            "key"
          )
        );
      }

      if (shareServer) {
        yours.push(
          makeItem(
            "shared",
            <A
              href={
                profile?.name ? `/${name}` : `/share/accounts/${account_id}`
              }
              external
            >
              Shared Files
            </A>,
            "bullhorn"
          )
        );

        yours.push(
          makeItem("stars", <A href="/stars">Stars</A>, "star-filled")
        );
      }
    }

    return [
      makeGroup(
        "your",
        <A href={join(basePath, "app")} external>
          <span style={{ color: "#a4acb3" }}>
            <Icon name="user" /> Your...
          </span>
        </A>,
        yours
      ),
    ];
  }

  function admin(): MenuItem[] {
    if (!is_admin) return [];
    return [
      DIVIDER,
      makeItem(
        "admin",
        <A href={join(basePath, "admin")} external>
          Site Administration
        </A>,
        "users"
      ),
    ];
  }

  const signout: MenuItem[] = [
    DIVIDER,
    makeItem(
      "sign-out",
      <A
        onClick={async () => {
          await apiPost("/accounts/sign-out", { all: false });
          router.push("/");
        }}
      >
        Sign Out
      </A>
    ),
  ];

  const items: MenuProps["items"] = [
    ...profileItems(),
    ...yourPages(),
    ...admin(),
    ...signout,
  ];

  const menu = <Menu mode="vertical" theme="dark" items={items} />;

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

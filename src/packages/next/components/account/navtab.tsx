/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* The "Account" navigation tab in the bar at the top. */

import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { join } from "path";
import { CSSProperties } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import Avatar from "components/account/avatar";
import {
  menuGroup,
  menuItem,
  MenuItem,
  MenuItems,
} from "components/antd-menu-items";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import useProfile from "lib/hooks/profile";
import { useRouter } from "next/router";

const DIVIDER = {
  type: "divider",
} as const;

interface Props {
  style: CSSProperties;
}

// We make this menu fixed width in all cases, since otherwise the entire top navbar
// would flicker when profile isn't initially defined. See
// https://github.com/sagemathinc/cocalc/issues/6504

const WIDTH = "125px";

export default function AccountNavTab({ style }: Props) {
  const router = useRouter();
  const { isCommercial, shareServer, siteName, sshGateway } = useCustomize();
  const profile = useProfile();
  if (!profile) {
    return (
      <div
        style={{
          cursor: "pointer",
          ...style,
          width: WIDTH,
        }}
      >
        Account
      </div>
    );
  }

  const { first_name, last_name, name, account_id, is_admin, is_anonymous } =
    profile;

  const profile_url = name ? `/${name}` : `/share/accounts/${account_id}`;

  const signedIn = menuItem(
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

  const docs = menuItem(
    "docs",
    <A href="https://doc.cocalc.com" external>
      Documentation
    </A>,
    "book"
  );

  const configuration = menuGroup(
    "configuration",
    <A href="/config/search/input">
      <span style={{ color: "#a4acb3" }}>
        <Icon name="wrench" /> Configuration
      </span>
    </A>,
    [
      menuItem("account", <A href="/config/account/name">Account</A>, "user"),
      menuItem(
        "editor",
        <A href="/config/editor/appearance">Editor</A>,
        "edit"
      ),
      menuItem(
        "system",
        <A href="/config/system/appearance">System</A>,
        "gear"
      ),
    ]
  );

  function profileItems() {
    if (!profile) return [];
    const ret: MenuItems = [];
    ret.push(signedIn);
    if (is_anonymous) {
      ret.push(
        menuItem(
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
      ret.push(menuItem("store", <A href="/store">Store</A>, "shopping-cart"));
    }
    ret.push(DIVIDER);
    ret.push(configuration);
    ret.push(DIVIDER);
    return ret;
  }

  function yourPages(): MenuItem[] {
    const yours: MenuItem[] = [];
    yours.push(
      menuItem(
        "projects",
        <A href={join(basePath, "projects")} external>
          {is_anonymous ? "Project" : "Projects"}
        </A>,
        "edit"
      )
    );

    if (!is_anonymous) {
      yours.push(menuItem("licenses", <A href="/licenses">Licenses</A>, "key"));

      if (isCommercial) {
        yours.push(
          menuItem("billing", <A href="/billing">Billing Management</A>, "credit-card")
        );
      }
      if (sshGateway) {
        yours.push(
          menuItem(
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
          menuItem(
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
          menuItem("stars", <A href="/stars">Stars</A>, "star-filled")
        );
      }
    }

    return [
      menuGroup(
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
      menuItem(
        "admin",
        <A href={join(basePath, "admin")} external>
          Site Administration
        </A>,
        "settings"
      ),
    ];
  }

  const signout: MenuItem[] = [
    DIVIDER,
    menuItem(
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

  // NOTE: we had a dark theme before for the menu, but that's deprecated from antd
  // https://github.com/ant-design/ant-design/issues/4903
  return (
    <div
      style={{
        display: "inline-block",
        cursor: "pointer",
        width: WIDTH,
      }}
    >
      {/* The negative margin fixes some weird behavior that stretches header. */}
      {account_id && (
        <>
          <Avatar account_id={account_id} style={{ margin: "-10px 0" }} />
          &nbsp;&nbsp;
        </>
      )}
      <Dropdown menu={{ items }} trigger={["click"]}>
        <span style={style}>Account ▼</span>
      </Dropdown>
    </div>
  );
}

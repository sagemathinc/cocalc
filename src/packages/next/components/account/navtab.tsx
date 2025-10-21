/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* The "Account" navigation tab in the bar at the top. */

import type { MenuProps } from "antd";
import { Dropdown } from "antd";
import { join } from "path";
import { CSSProperties } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import {
  type PreferencesSubTabType,
  type SettingsPageType,
} from "@cocalc/util/types/settings";
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

// Type-safe settings link helper
type SettingsLink =
  | `/settings/${SettingsPageType}`
  | `/settings/preferences/${PreferencesSubTabType}`;

// Helper function to create type-safe settings links with basePath prefix
function createSettingsLink(path: SettingsLink): string {
  return join(basePath, path);
}

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
    </A>,
  );

  const docs = menuItem(
    "docs",
    <A href="https://doc.cocalc.com" external>
      Documentation
    </A>,
    "book",
  );

  const configuration = menuGroup(
    "configuration",
    <A href={createSettingsLink("/settings/profile")}>
      <span style={{ color: "#a4acb3" }}>
        <Icon name="wrench" /> Account
      </span>
    </A>,
    [
      menuItem(
        "profile",
        <A href={createSettingsLink("/settings/profile")}>Profile</A>,
        "address-card",
      ),
      menuItem(
        "settings",
        <A href={createSettingsLink("/settings/index")}>Settings</A>,
        "cogs",
      ),
      menuItem(
        "appearance",
        <A href={createSettingsLink("/settings/preferences/appearance")}>
          Appearance
        </A>,
        "highlighter",
      ),
      menuItem(
        "communication",
        <A href={createSettingsLink("/settings/preferences/communication")}>
          Communication
        </A>,
        "mail",
      ),
      menuItem(
        "keys",
        <A href={createSettingsLink("/settings/preferences/keys")}>
          SSH & API Keys
        </A>,
        "key",
      ),
      DIVIDER,
      menuItem(
        "subscriptions",
        <A href={createSettingsLink("/settings/subscriptions")}>
          Subscriptions
        </A>,
        "calendar",
      ),
      menuItem(
        "licenses",
        <A href={createSettingsLink("/settings/licenses")}>Licenses</A>,
        "key",
      ),
      menuItem(
        "payg",
        <A href={createSettingsLink("/settings/payg")}>Pay As You Go</A>,
        "line-chart",
      ),
      DIVIDER,
      menuItem(
        "purchases",
        <A href={createSettingsLink("/settings/purchases")}>Purchases</A>,
        "money-check",
      ),
      menuItem(
        "payments",
        <A href={createSettingsLink("/settings/payments")}>Payments</A>,
        "credit-card",
      ),
      menuItem(
        "statements",
        <A href={createSettingsLink("/settings/statements")}>Statements</A>,
        "calendar-week",
      ),
    ],
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
          "user",
        ),
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
        <a href={join(basePath, "projects")}>
          {is_anonymous ? "Project" : "Projects"}
        </a>,
        "edit",
      ),
    );

    if (!is_anonymous) {
      yours.push(
        menuItem(
          "messages",
          <A href="/notifications#page=messages-inbox">Messages</A>,
          "mail",
        ),
      );
      yours.push(
        menuItem(
          "mentions",
          <A href="/notifications#page=unread">@-Mentions</A>,
          "comment",
        ),
      );
      yours.push(
        menuItem(
          "support",
          <A href={createSettingsLink("/settings/support")}>Support Tickets</A>,
          "medkit",
        ),
      );

      if (sshGateway) {
        yours.push(
          menuItem(
            "ssh",
            <A href={createSettingsLink("/settings/preferences/keys")}>
              SSH Keys
            </A>,
            "key",
          ),
        );
      }

      if (shareServer) {
        yours.push(
          menuItem(
            "shared",
            <A href={createSettingsLink("/settings/public-files")}>
              Published Files
            </A>,
            "share-square",
          ),
        );

        yours.push(
          menuItem("stars", <A href="/stars">Starred Files</A>, "star-filled"),
        );
      }
    }

    return [
      menuGroup(
        "your",
        <span style={{ color: "#a4acb3" }}>
          <Icon name="user" /> Your...
        </span>,
        yours,
      ),
    ];
  }

  function admin(): MenuItem[] {
    if (!is_admin) return [];
    return [
      DIVIDER,
      menuItem(
        "admin",
        <a href={join(basePath, "admin")}>Site Administration</a>,
        "settings",
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
      </A>,
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

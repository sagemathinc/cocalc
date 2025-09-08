/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Popconfirm, Popover } from "antd";
import React from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { AccountActions } from "@cocalc/frontend/account";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";

interface Props {
  icon: React.ReactNode; // When clicked, show popover
  links: React.ReactNode; // Should change view to correct account settings tab when clicked
  label_class: string; // class name for AccountTabDropdown label
  show_label: boolean; // This tells button to show
  is_active: boolean; // if true set button background to ACTIVE_BG_COLOR
  user_label: string;
}

interface AccountTabProps {
  icon;
  links;
  label_class;
  show_label;
  is_active;
  user_label;
}

export const AccountTabDropdown: React.FC<Props> = (props: AccountTabProps) => {
  const { icon, links, label_class, show_label, is_active, user_label } = props;
  const intl = useIntl();

  const label = intl.formatMessage(labels.account);

  // If icon is a string then use the Icon component
  // Else (it is a node already) just render icon
  return (
    <Popover
      placement="bottom"
      title={"Signed in as " + user_label}
      trigger="click"
      content={links}
    >
      <div
        style={{
          display: "flex",
          flex: "0 0 auto",
          float: "left",
          position: "relative",
          height: "30px",
          padding: "8px",
          whiteSpace: "nowrap",
          ...(is_active && { backgroundColor: "white" }),
        }}
      >
        {icon}
        <span style={{ marginLeft: 5 }} className={label_class}>
          {show_label ? label : undefined}
        </span>
      </div>
    </Popover>
  );
};

interface LinksProps {
  account_actions: AccountActions;
  page_actions: any;
}

export const DefaultAccountDropDownLinks: React.FC<LinksProps> = ({
  account_actions, // Type AccountActions
  page_actions, // PageActions (untyped for now)
}) => {
  return (
    <>
      <div className="cocalc-account-button-dropdown-links">
        <li>
          <a
            style={{
              width: "100%",
              padding: "4px 8px 4px 16px",
              display: "inline-block",
            }}
            className={"cocalc-account-button"}
            onClick={(event) => {
              event.preventDefault();
              page_actions.set_active_tab("account"); // Set to account page
              account_actions.set_active_tab("account"); /// Set to the Subs and course packs tab
            }}
            href=""
          >
            Preferences
          </a>
        </li>
        <li>
          <a
            style={{
              width: "100%",
              padding: "4px 8px 4px 16px",
              display: "inline-block",
            }}
            className={"cocalc-account-button"}
            onClick={(event) => {
              event.preventDefault();
              page_actions.set_active_tab("account"); // Set to account page
              account_actions.set_active_tab("billing"); /// Set to the Preferences tab
            }}
            href=""
          >
            Billing
          </a>
        </li>
        <li>
          <a
            style={{
              width: "100%",
              padding: "4px 8px 4px 16px",
              display: "inline-block",
            }}
            className={"cocalc-account-button"}
            onClick={(event) => {
              event.preventDefault();
              page_actions.set_active_tab("account"); // Set to account page
              account_actions.set_active_tab("upgrades"); /// Set to the Preferences tab
            }}
            href=""
          >
            Upgrades
          </a>
        </li>
        <li>
          <a
            style={{
              width: "100%",
              padding: "4px 8px 4px 16px",
              display: "inline-block",
            }}
            className={"cocalc-account-button"}
            onClick={(event) => {
              event.preventDefault();
              page_actions.set_active_tab("account"); // Set to account page
              account_actions.set_active_tab("support"); /// Set to the Preferences tab
            }}
            href=""
          >
            Support
          </a>
        </li>
        <li>
          <Popconfirm
            title={
              <FormattedMessage
                id="account.account-button.confirm.title"
                defaultMessage={"Sign out of your account?"}
              />
            }
            onConfirm={() => account_actions.sign_out(false, false)}
            okText={
              <FormattedMessage
                id="account.account-button.confirm.ok"
                defaultMessage={"Yes, sign out"}
              />
            }
            cancelText={<CancelText />}
          >
            <a
              style={{
                width: "100%",
                padding: "4px 8px 4px 16px",
                display: "inline-block",
              }}
              className={"cocalc-account-button"}
              href=""
            >
              Sign out...
            </a>
          </Popconfirm>
        </li>
      </div>
    </>
  );
};

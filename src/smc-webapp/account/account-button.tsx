import * as React from "react";
import { Popconfirm, Popover, Icon as Ant_icon } from "antd";
const { NavItem } = require("react-bootstrap");
import { AccountActions } from "../account";
import { Icon } from "../r_misc";

interface Props {
  icon: React.ReactNode; // When clicked, show popover
  links: React.ReactNode; // Should change view to correct account settings tab when clicked
  label_class: string; // class name for AccountTabDropdown label
  show_label: boolean; // This tells button to show
  is_active: boolean; // if true set button background to ACTIVE_BG_COLOR
  user_label: string;
  account_actions: AccountActions;
  page_actions: any;
}

export const AccountTabDropdown: React.FC<Props> = ({
  icon,
  links,
  label_class,
  show_label,
  is_active,
  user_label,
  account_actions,
  page_actions
}) => {
  return (
    <Popover
      placement="bottom"
      title={"Signed in as " + user_label}
      trigger="click"
      content={links}
    >
      <NavItem
        active={is_active}
        style={{
          float: "left",
          position: "relative",
          height: "30px"
        }}
      >
        <div
          style={{ padding: "10px" }}
          onClick={event => {
            event.preventDefault();
            page_actions.set_active_tab("account"); // Set to account page
            account_actions.set_active_tab("account"); /// Set to the Preferences tab
          }}
        >
          {icon}
          <span style={{ marginLeft: 5 }} className={label_class}>
            {show_label ? "Account" : ""}
          </span>
        </div>
      </NavItem>
    </Popover>
  );
};

interface LinksProps {
  name: string;
  label: string;
  icon: string;
  account_actions: AccountActions;
  page_actions: any;
}

const DropDownLinks: React.FC<LinksProps> = ({
  name,
  label,
  icon,
  account_actions,
  page_actions
}) => {
  return (
    <a
      style={{
        width: "100%",
        padding: "4px 8px 4px 16px",
        display: "block"
      }}
      className={"cocalc-account-button"}
      onClick={event => {
        event.preventDefault();
        page_actions.set_active_tab("account"); // Set to account page
        account_actions.set_active_tab(name); /// Set to the Preferences tab
      }}
      href=""
    >
      <span>
        <Icon name={icon} />
      </span>{" "}
      {label}
    </a>
  );
};

interface LinksProps {
  account_actions: AccountActions;
  page_actions: any;
}

export const DefaultAccountDropDownLinks: React.FC<LinksProps> = ({
  account_actions, // Type AccountActions
  page_actions // PageActions (untyped for now)
}) => {
  return (
    <>
      <div className="cocalc-account-button-dropdown-links">
        <DropDownLinks
          name="account"
          label="Preferences"
          icon="wrench"
          account_actions={account_actions}
          page_actions={page_actions}
        />
        <DropDownLinks
          name="billing"
          label="Billing"
          icon="money"
          account_actions={account_actions}
          page_actions={page_actions}
        />
        <DropDownLinks
          name="upgrades"
          label="Upgrades"
          icon="arrow-circle-up"
          account_actions={account_actions}
          page_actions={page_actions}
        />
        <DropDownLinks
          name="support"
          label="Support"
          icon="medkit"
          account_actions={account_actions}
          page_actions={page_actions}
        />
        <Popconfirm
          title={"Sign out of your account?"}
          onConfirm={() => account_actions.sign_out(false, false)}
          okText={"Yes, sign out"}
          cancelText={"Cancel"}
        >
          <a
            style={{
              width: "100%",
              padding: "4px 8px 4px 16px",
              display: "block",
              background: "#fd4747",
              color: "white"
            }}
            className={"cocalc-account-button"}
            href=""
          >
            <span>
              <Ant_icon type="logout" />
            </span>{" "}
            Sign out...
          </a>
        </Popconfirm>
      </div>
    </>
  );
};

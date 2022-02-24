/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered, redux } from "../app-framework";
import { Button, Popconfirm } from "antd";
import { LogoutOutlined } from "@ant-design/icons";

interface Props {
  everywhere?: boolean;
  sign_in?: boolean;
  highlight?: boolean;
  style?: React.CSSProperties;
}

export const SignOut: React.FC<Props> = (props: Props) => {
  const { everywhere, sign_in, highlight, style } = props;

  function sign_out(): void {
    const account = redux.getActions("account");
    if (account != null) {
      account.sign_out(!!everywhere, !!sign_in);
    }
  }

  function render_body(): Rendered {
    if (sign_in) {
      return <span>Sign in to your account...</span>;
    } else {
      return <span>Sign out{everywhere ? " everywhere" : ""}...</span>;
    }
  }

  // I think not using reduxProps is fine for this, since it's only rendered once
  // you are signed in, and falling back to "your account" isn't bad.
  const store = redux.getStore("account");
  const account: string = store.get("email_address") ?? "your account";

  let title: string = `Are you sure you want to sign ${account} out `;

  if (everywhere) {
    title +=
      "on all web browsers? Every web browser will have to reauthenticate before using this account again.";
  } else {
    title += "on this web browser?";
  }

  if (store.get("is_anonymous")) {
    title +=
      "\n Everything you have done using this TEMPORARY ACCOUNT will be immediately deleted!  If you would like to save your work to a new account, click cancel and sign up below.";
  }

  return (
    <Popconfirm
      title={<div style={{ maxWidth: "60ex" }}>{title}</div>}
      onConfirm={sign_out}
      okText={`Yes, sign out${everywhere ? " everywhere" : ""}`}
      cancelText={"Cancel"}
    >
      <Button
        icon={<LogoutOutlined />}
        type={highlight ? "primary" : undefined}
        style={style}
      >
        {render_body()}
      </Button>
    </Popconfirm>
  );
};

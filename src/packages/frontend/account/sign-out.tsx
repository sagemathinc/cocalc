/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { Button, Popconfirm } from "antd";
import { FormattedMessage, useIntl } from "react-intl";
import { Icon } from "@cocalc/frontend/components/icon";
import { React, Rendered, redux } from "@cocalc/frontend/app-framework";
import { labels } from "@cocalc/frontend/i18n";
import track from "@cocalc/frontend/user-tracking";

interface Props {
  everywhere?: boolean;
  sign_in?: boolean;
  highlight?: boolean;
  style?: React.CSSProperties;
  narrow?: boolean;
}

export const SignOut: React.FC<Props> = (props: Readonly<Props>) => {
  const { everywhere, sign_in, highlight, style, narrow = false } = props;

  const intl = useIntl();

  function sign_out(): void {
    const account = redux.getActions("account");
    if (account != null) {
      track("sign-out", { how: "settings-page", everywhere, sign_in });
      account.sign_out(!!everywhere, !!sign_in);
    }
  }

  function render_body(): Rendered {
    if (sign_in) {
      return (
        <span>
          <FormattedMessage
            id="account.sign_out.body.sign_in"
            description={"Sign in button, if not signed in"}
            defaultMessage={"Sign in to your account..."}
          />
        </span>
      );
    } else {
      return (
        <span>
          <FormattedMessage
            id="account.sign_out.body.sign_out"
            description={"Sign out button, if signed in"}
            defaultMessage={`Sign out{everywhere, select, true { everywhere} other {}}...`}
            values={{ everywhere }}
          />
        </span>
      );
    }
  }

  // I think not using reduxProps is fine for this, since it's only rendered once
  // you are signed in, and falling back to "your account" isn't bad.
  const store = redux.getStore("account");
  const account: string = store.get("email_address") ?? "your account";

  return (
    <Popconfirm
      title={
        <div style={{ maxWidth: "60ex" }}>
          <FormattedMessage
            id="account.sign-out.button.title"
            description="Sign out/Sign out everyhwere button in account settings"
            defaultMessage={`Are you sure you want to sign {account} out
{everywhere, select,
 true {on all web browsers? Every web browser will have to reauthenticate before using this account again.}
 other {on this web browser?}
}
{is_anonymous, select,
  true {Everything you have done using this TEMPORARY ACCOUNT will be immediately deleted!  If you would like to save your work to a new account, click cancel and sign up below.}
  other {}
}`}
            values={{
              account,
              everywhere,
              is_anonymous: store.get("is_anonymous"),
            }}
          />
        </div>
      }
      onConfirm={sign_out}
      okText={intl.formatMessage(
        {
          id: "account.sign-out.button.ok",
          defaultMessage: `Yes, sign out{everywhere, select, true { everywhere} other {}}`,
        },
        { everywhere },
      )}
      cancelText={intl.formatMessage(labels.cancel)}
    >
      {/* NOTE: weirdly darkreader breaks when we use the antd LogoutOutlined icon!? */}
      <Button type={highlight ? "primary" : undefined} style={style}>
        <Icon name="sign-in" />{" "}
        {!narrow || everywhere ? render_body() : undefined}
      </Button>
    </Popconfirm>
  );
};

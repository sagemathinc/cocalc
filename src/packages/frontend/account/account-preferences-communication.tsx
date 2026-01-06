/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, IconName } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export const COMMUNICATION_ICON_NAME: IconName = "mail";

export function AccountPreferencesCommunication(): React.JSX.Element {
  const intl = useIntl();
  const other_settings = useTypedRedux("account", "other_settings");
  const stripe_customer = useTypedRedux("account", "stripe_customer");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified",
  );
  const email_address = useTypedRedux("account", "email_address");
  const isVerified = !!email_address_verified?.get(email_address ?? "");
  const is_stripe_customer = !!stripe_customer?.getIn([
    "subscriptions",
    "total_count",
  ]);

  function on_change(name: string, value: any): void {
    redux.getActions("account").set_other_settings(name, value);
  }

  function toggle_global_banner(val: boolean): void {
    if (val) {
      // this must be "null", not "undefined" – otherwise the data isn't stored in the DB.
      on_change("show_global_info2", null);
    } else {
      on_change("show_global_info2", webapp_client.server_time());
    }
  }

  function render_global_banner() {
    return (
      <Switch
        checked={!other_settings.get("show_global_info2")}
        onChange={(e) => toggle_global_banner(e.target.checked)}
      >
        <FormattedMessage
          id="account.other-settings.global_banner"
          defaultMessage={`<strong>Show Announcement Banner</strong>: only shows up if there is a
        message`}
        />
      </Switch>
    );
  }

  function render_no_free_warnings() {
    const extra = is_stripe_customer ? (
      <span>(thanks for being a customer)</span>
    ) : (
      <span>(only available to customers)</span>
    );

    return (
      <Switch
        disabled={!is_stripe_customer}
        checked={!!other_settings.get("no_free_warnings")}
        onChange={(e) => on_change("no_free_warnings", e.target.checked)}
      >
        <strong>Hide free warnings</strong>: do{" "}
        <strong>
          <i>not</i>
        </strong>{" "}
        show a warning banner when using a free trial project {extra}
      </Switch>
    );
  }

  function render_no_email_new_messages() {
    return (
      <>
        <Switch
          checked={other_settings.get("no_email_new_messages")}
          onChange={(e) => {
            on_change("no_email_new_messages", e.target.checked);
          }}
        >
          Do NOT send email when you get new{" "}
          <Button
            onClick={(e) => {
              e.stopPropagation();
              redux.getActions("page").set_active_tab("notifications");
              redux
                .getActions("mentions")
                .set_filter("messages-inbox" as "messages-inbox");
            }}
            type="link"
            size="small"
          >
            Internal Messages
          </Button>
        </Switch>
        {!isVerified && !other_settings.get("no_email_new_messages") && (
          <>
            (NOTE: You must also verify your email address above to get emails
            about new messages.)
          </>
        )}
      </>
    );
  }

  return (
    <div role="region" aria-label="Communication settings">
      <Panel
        size="small"
        role="region"
        aria-label="Notification settings"
        header={
          <>
            <Icon name={COMMUNICATION_ICON_NAME} />{" "}
            {intl.formatMessage(labels.communication)}
          </>
        }
      >
        {render_global_banner()}
        {render_no_free_warnings()}
        {render_no_email_new_messages()}
      </Panel>
    </div>
  );
}

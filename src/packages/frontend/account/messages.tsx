import { Button } from "antd";

import { Panel, Switch } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Messages() {
  const other_settings = useTypedRedux("account", "other_settings");
  const email_address_verified = useTypedRedux(
    "account",
    "email_address_verified",
  );
  const email_address = useTypedRedux("account", "email_address");

  const isVerified = !!email_address_verified?.get(email_address ?? "");
  return (
    <Panel
      size={"small"}
      style={{ marginTop: "10px" }}
      header={
        <Button
          onClick={() => {
            redux.getActions("page").set_active_tab("notifications");
            redux
              .getActions("mentions")
              .set_filter("messages-inbox" as "messages-inbox");
          }}
          type="link"
          style={{ fontSize: "16px", marginLeft: "-15px" }}
        >
          <Icon name="mail" /> Message Settings
        </Button>
      }
    >
      <Switch
        checked={other_settings?.get("no_email_new_messages")}
        onChange={(e) => {
          const actions = redux.getActions("account");
          actions.set_other_settings("no_email_new_messages", e.target.checked);
        }}
      >
        Do NOT send email when you get new internal messages
      </Switch>
      {!isVerified && !other_settings?.get("no_email_new_messages") && (
        <>
          (NOTE: You must also verify your email address above to get emails
          about new messages.)
        </>
      )}
    </Panel>
  );
}

import { Button, Card, Checkbox } from "antd";
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
    <Card
      style={{ marginTop: "10px" }}
      title={
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
          <Icon name="mail" /> Messaging Settings
        </Button>
      }
    >
      <Checkbox
        checked={other_settings?.get("no_email_new_messages")}
        onChange={(e) => {
          const actions = redux.getActions("account");
          actions.set_other_settings("no_email_new_messages", e.target.checked);
        }}
      >
        Do NOT send email when you get new internal messages
      </Checkbox>
      {!isVerified && !other_settings?.get("no_email_new_messages") && (
        <>
          (NOTE: You must also verify your email address above to get emails
          about new messages.)
        </>
      )}
    </Card>
  );
}

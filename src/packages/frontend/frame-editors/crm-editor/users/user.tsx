import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Card, Space } from "antd";
import { CopyToClipBoard, TimeAgo } from "@cocalc/frontend/components";

export default function User({
  account_id,
  first_name,
  last_name,
  name,
  email_address,
  last_active,
  created,
  banned,
}) {
  return (
    <Card
      style={{ margin: "5px" }}
      title={
        <>
          {banned && (
            <Button danger style={{ float: "right" }}>
              Banned
            </Button>
          )}
          <div style={{ float: "right", fontSize: "11pt", fontWeight: 250 }}>
            {email_address}
          </div>
          <Avatar account_id={account_id} style={{ marginRight: "15px" }} />
          {first_name} {last_name}
        </>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          Account Id: <CopyToClipBoard value={account_id} />
        </Space>
        <div>
          Last Active: {last_active ? <TimeAgo date={last_active} /> : "never"}
        </div>
        {created && (
          <div>
            Created: <TimeAgo date={created} />
          </div>
        )}
      </Space>
    </Card>
  );
}

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Tag, Card, Space } from "antd";
import { CopyToClipBoard, TimeAgo } from "@cocalc/frontend/components";
import Projects from "./projects";

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
            <Tag style={{ float: "right", margin: "0 15px" }} color="error">
              banned
            </Tag>
          )}
          <div style={{ float: "right", fontSize: "11pt", fontWeight: 250 }}>
            {email_address}
          </div>
          <Avatar account_id={account_id} style={{ marginRight: "15px" }} />
          {first_name} {last_name} {name ? `(name: ${name})` : ""}
        </>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          Account Id: <CopyToClipBoard value={account_id} />
        </Space>
        <div>
          Last Active: {last_active ? <TimeAgo date={last_active} /> : "never"}
          {created && (
            <span>
              {" "}
              (Created: <TimeAgo date={created} />)
            </span>
          )}
        </div>
        <Projects account_id={account_id} />
      </Space>
    </Card>
  );
}

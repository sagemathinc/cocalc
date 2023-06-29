import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Tag, Card, Space } from "antd";
import { TimeAgo } from "@cocalc/frontend/components";
import Projects from "./projects";
import Impersonate from "./impersonate";
import PayAsYouGoMinBalance from "./pay-as-you-go-min-balance";

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
      headStyle={{ backgroundColor: "#eee" }}
      title={
        <>
          {banned && (
            <Tag
              style={{ float: "right", margin: "5px 0 5px 15px" }}
              color="error"
            >
              banned
            </Tag>
          )}
          <div
            style={{
              marginTop: "5px",
              float: "right",
              fontSize: "11pt",
              fontWeight: 250,
            }}
          >
            {email_address}, {account_id}
          </div>
          <Avatar account_id={account_id} style={{ marginRight: "15px" }} />
          {first_name} {last_name} {name ? `(name: ${name})` : ""}
        </>
      }
    >
      <Space direction="vertical" style={{ width: "100%" }}>
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
        <Impersonate
          account_id={account_id}
          first_name={first_name}
          last_name={last_name}
        />
        <PayAsYouGoMinBalance account_id={account_id} />
      </Space>
    </Card>
  );
}

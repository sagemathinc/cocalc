import { ReactNode } from "react";
import { render } from "./register";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { List } from "antd";

render({ type: "accounts" }, ({ field, obj }) => {
  const account_ids = obj[field];
  if (!account_ids) return null;
  const v: ReactNode[] = [];
  for (const account_id of account_ids) {
    v.push(<Avatar key={account_id} account_id={account_id} />);
  }
  return <div>{v}</div>;
});

render({ type: "account" }, ({ field, obj }) => {
  const account_id = obj[field];
  if (!account_id) return null;
  return <Avatar key={account_id} account_id={account_id} />;
});

render({ type: "usersmap" }, ({ field, obj }) => {
  const users = obj[field];
  if (!users) return null;
  const data: any[] = [];
  for (const account_id in users) {
    data.push({ account_id, title: JSON.stringify(users[account_id]) });
  }
  return (
    <List
      itemLayout="horizontal"
      dataSource={data}
      renderItem={(item) => (
        <List.Item>
          <List.Item.Meta
            avatar={<Avatar account_id={item.account_id} />}
            title={item.title}
          />
        </List.Item>
      )}
    />
  );
});

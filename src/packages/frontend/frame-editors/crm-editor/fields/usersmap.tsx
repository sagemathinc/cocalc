import { render } from "./register";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { List } from "antd";


render({ type: "usersmap" }, ({ field, obj, viewOnly }) => {
  const users = obj[field];
  if (!users) return null;
  const data: any[] = [];
  if (viewOnly) {
    for (const account_id in users) {
      data.push(<Avatar key={account_id} account_id={account_id} size={18} />);
    }
    return <>{data}</>;
  }

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

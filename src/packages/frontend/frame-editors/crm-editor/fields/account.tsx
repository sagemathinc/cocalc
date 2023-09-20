import { Collapse } from "antd";

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import UserViaSearch from "../users/user-via-search";
import { render } from "./register";

export const AVATAR_SIZE = 18;

render({ type: "account" }, ({ field, obj }) => {
  const account_id = obj[field];
  if (!account_id) return null;
  return (
    <Collapse
      items={[
        {
          key: account_id,
          label: <Avatar account_id={account_id} size={AVATAR_SIZE} />,
          children: <UserViaSearch query={account_id} />,
        },
      ]}
    />
  );
});

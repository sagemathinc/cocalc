import { render } from "./register";
import { Collapse } from "antd";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import UserViaSearch from "../users/user-via-search";

export const AVATAR_SIZE = 18;

const { Panel } = Collapse;

render({ type: "account" }, ({ field, obj }) => {
  const account_id = obj[field];
  if (!account_id) return null;
  return (
    <Collapse>
      <Panel key={account_id} header={<Avatar account_id={account_id} size={AVATAR_SIZE} />}>
        <UserViaSearch query={account_id} />
      </Panel>
    </Collapse>
  );
});

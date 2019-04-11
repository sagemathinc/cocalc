import * as React from "react";

import { redux } from "../app-framework";

const { Avatar } = require("../other-users");
const { Icon, TimeAgo } = require("../r_misc");
const { User } = require("../users");

export function MentionRow({
  account_id,
  timestamp,
  path,
  project_id,
  description,
  user_map
}: {
  account_id: string;
  timestamp: number;
  path: string;
  project_id: string;
  description?: string;
  user_map: any;
}) {
  const click = () => {
    redux.getProjectActions(project_id).open_file({ path: path, chat: true });
  };
  return (
    <li onClick={click}>
      <div style={avatar_wrapping_style}>
        <Avatar account_id={account_id} />
      </div>
      <div style={description_style}>
        <strong>
          <User account_id={account_id} user_map={user_map} />
        </strong>{" "}
        mentioned you in a comment.
        {description && (
          <div style={{ color: "rgb(100, 100, 100)", margin: "4px 10px" }}>
            "{description}"
          </div>
        )}
        {!description && <br />}
        <Icon name={"comment"} /> <TimeAgo date={timestamp} />
      </div>
    </li>
  );
}

const description_style: React.CSSProperties = { flex: "1" };
const avatar_wrapping_style: React.CSSProperties = {
  margin: ".9em"
};

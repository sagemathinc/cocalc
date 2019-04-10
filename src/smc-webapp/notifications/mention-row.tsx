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
  user_map
}: {
  account_id: string;
  timestamp: number;
  path: string;
  project_id: string;
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
        <br />
        <Icon name={"comment"} /> <TimeAgo date={timestamp} />
      </div>
      <div style={options_style}>
        <Icon name={"ellipsis-h"} />
        <Icon name={"dot-circle"} />
      </div>
    </li>
  );
}

const avatar_wrapping_style: React.CSSProperties = {
  marginTop: "4px",
  marginRight: "5px"
};

const description_style: React.CSSProperties = { flex: "1" };

const options_style: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  color: "#ccc"
};

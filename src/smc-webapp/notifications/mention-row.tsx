import * as React from "react";

import { redux } from "../app-framework";

const { Avatar } = require("../other-users");
const { Icon, TimeAgo } = require("../r_misc");

const row_style: React.CSSProperties = {
  borderBottom: "1px solid rgb(221, 221, 221)",
  cursor: "pointer",
  flex: "1",
  display: "flex",
  padding: "6px 12px 5px 13px"
};

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

export function MentionRow({
  account_id,
  timestamp,
  path,
  project_id
}: {
  account_id: string;
  timestamp: number;
  path: string;
  project_id: string;
}) {
  const click = () => {
    redux.getProjectActions(project_id).open_file({ path: path, chat: true });
  };
  return (
    <div style={row_style} onClick={click}>
      <div style={avatar_wrapping_style}>
        <Avatar account_id={account_id} />
      </div>
      <div style={description_style}>
        <strong>
          {redux
            .getStore("users")
            .get_name(account_id)
            .trim()}
        </strong>{" "}
        mentioned you in a comment.
        <br />
        <Icon name={"comment"} /> <TimeAgo date={timestamp} />
      </div>
      <div style={options_style}>
        <Icon name={"ellipsis-h"} />
        <Icon name={"dot-circle"} />
      </div>
    </div>
  );
}

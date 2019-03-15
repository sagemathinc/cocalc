import * as React from "react";

const { Avatar } = require("../other-users");
const { Icon, TimeAgo } = require("../r_misc");

const row_style: React.CSSProperties = { flex: "1", display: "flex" };

const avatar_wrapping_style: React.CSSProperties = {
  marginTop: "5px",
  marginRight: "5px"
};

const description_style: React.CSSProperties = { flex: "1" };

const options_style: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  color: "#ccc"
};

export function NotificationRow() {
  return (
    <div style={row_style}>
      <div style={avatar_wrapping_style}>
        <Avatar account_id={"21046e70-9a9e-4eaa-8861-ab324ae3a8f9"} />
      </div>
      <div style={description_style}>
        <strong>Tiffany Tao</strong> mentioned you in a comment
        <br />
        <Icon name={"comment"} /> <TimeAgo date={1235897090}  />
      </div>
      <div style={options_style}>
        <Icon name={"ellipsis-h"} />
        <Icon name={"dot-circle"} />
      </div>
    </div>
  );
}

import * as React from "react";

import { redux } from "../../app-framework";
import { MentionInfo } from "./types";

const { Avatar } = require("../../other-users");
import { Icon, TimeAgo } from "../../r_misc";
import { User } from "../../users";

export function MentionRow({
  id,
  mention,
  user_map,
}: {
  id: string;
  mention: MentionInfo;
  user_map: any;
}) {
  const {
    path,
    project_id,
    source,
    time,
    target,
    description,
  } = mention.toJS();

  const on_row_click = () => {
    redux.getProjectActions(project_id).open_file({ path: path, chat: true });
  };

  const is_read = mention.getIn(["users", target, "read"]);
  const is_saved = mention.getIn(["users", target, "saved"]);
  let read_icon = "square-o";
  let save_icon = "bookmark-o";
  let row_style: React.CSSProperties = {};

  if (is_read) {
    read_icon = "check-square-o";
    row_style = {
      backgroundColor: "rgb(246, 248, 250)",
      color: "rgb(88, 96, 105)",
    };
  }

  if (is_saved) {
    save_icon = "bookmark";
  }

  const on_read_unread_click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");

    if (is_read) {
      actions.mark_unread(mention, id);
    } else {
      actions.mark_read(mention, id);
    }
  };

  const on_save_unsave_click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");

    if (is_saved) {
      actions.mark_unsaved(mention, id);
    } else {
      actions.mark_saved(mention, id);
    }
  };

  return (
    <li onClick={on_row_click} style={row_style}>
      <div style={avatar_wrapping_style}>
        <Avatar account_id={source} />
      </div>
      <div style={description_style}>
        <strong>
          <User account_id={source} user_map={user_map} />
        </strong>{" "}
        mentioned you in a comment.
        {description && (
          <div style={{ color: "rgb(100, 100, 100)", margin: "4px 10px" }}>
            "{description}"
          </div>
        )}
        {!description && <br />}
        <Icon name={"comment"} /> <TimeAgo date={time.getTime()} />
      </div>
      <div>
        <Icon
          name={save_icon}
          size={"lg"}
          onClick={on_save_unsave_click}
          style={{ color: "rgb(100, 100, 100)", marginRight: "10px" }}
        />
        <Icon
          name={read_icon}
          size={"lg"}
          onClick={on_read_unread_click}
          style={{ color: "rgb(100, 100, 100)" }}
        />
      </div>
    </li>
  );
}

const description_style: React.CSSProperties = { flex: "1" };
const avatar_wrapping_style: React.CSSProperties = {
  margin: ".9em",
};

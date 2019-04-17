import * as React from "react";

import { redux } from "../app-framework";
import { MentionInfo } from "./types";

const { Avatar } = require("../other-users");
const { Icon, TimeAgo } = require("../r_misc");
const { User } = require("../users");

export function MentionRow({
  mention,
  user_map
}: {
  mention: MentionInfo;
  user_map: any;
}) {
  const {
    path,
    project_id,
    source,
    time,
    target,
    description
  } = mention.toJS();

  const on_row_click = () => {
    redux.getProjectActions(project_id).open_file({ path: path, chat: true });
  };

  const is_read: boolean = mention.getIn(["users", target, "read"]);
  const is_saved: boolean = mention.getIn(["users", target, "saved"]);
  let read_icon = "circle-thin";
  let save_icon = "bookmark-o";

  if (is_read) {
    read_icon = "check-circle";
  }

  if (is_saved) {
    save_icon = "bookmark";
  }

  const on_read_unread_click = e => {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");

    if (is_read) {
      actions.mark_unread(mention);
    } else {
      actions.mark_read(mention);
    }
  };

  const on_save_unsave_click = e => {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");

    if (is_saved) {
      actions.mark_unsaved(mention);
    } else {
      actions.mark_saved(mention);
    }
  };

  return (
    <li onClick={on_row_click}>
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
        <Icon name={save_icon} size={"2x"} onClick={on_save_unsave_click} />{" "}
        <Icon name={read_icon} size={"2x"} onClick={on_read_unread_click} />
      </div>
    </li>
  );
}

const description_style: React.CSSProperties = { flex: "1" };
const avatar_wrapping_style: React.CSSProperties = {
  margin: ".9em"
};

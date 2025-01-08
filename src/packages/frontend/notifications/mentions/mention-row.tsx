/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { CSS, redux, useState } from "@cocalc/frontend/app-framework";
import { Icon, IconName, TimeAgo } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { User } from "@cocalc/frontend/users";
import { COLORS } from "@cocalc/util/theme";
import { NotificationFilter, MentionInfo } from "./types";
import { BOOKMARK_ICON_NAME } from "./util";

const DESCRIPTION_STYLE: CSS = {
  flex: "1 1 auto",
} as const;

const AVATAR_WRAPPING_STYLE: CSS = {
  flex: "0 0 auto",
  margin: "0 .9em",
} as const;

const ACTION_ICONS_WRAPPING_STYLE: CSS = {
  flex: "0 0 auto",
  margin: "auto .9em",
} as const;

interface Props {
  id: string;
  mention: MentionInfo;
  user_map: any;
  filter: NotificationFilter;
}

export function MentionRow(props: Props) {
  const { id, mention, user_map, filter } = props;
  const { path, project_id, source, time, target, description, fragment_id } =
    mention.toJS();

  const [clicked, setClicked] = useState(false);

  const fragmentId = Fragment.decode(fragment_id);
  const is_read = mention.getIn(["users", target, "read"]);
  const is_saved = mention.getIn(["users", target, "saved"]);

  const read_icon: IconName =
    (is_read && !clicked) || (!is_read && clicked) ? "eye" : "eye-slash";

  // think of "in transition" between read and unread
  const clickedStyle: CSS =
    clicked && (filter === "unread" || filter === "read")
      ? { backgroundColor: COLORS.GRAY_LL }
      : {};

  const row_style: CSS =
    is_read && !clicked
      ? { color: "rgb(88, 96, 105)", ...clickedStyle }
      : { ...clickedStyle };

  function markReadState(how: "read" | "unread") {
    if (filter === "unread" || filter === "read") {
      // the timeout is because visually seeing the mention disappear
      // right when you click on it is disturbing.
      setClicked(true); // a visual feedback, that user did just click on it
      setTimeout(() => {
        setClicked(false);
        redux.getActions("mentions")?.mark(mention, id, how);
      }, 1000);
    } else {
      // row won't disappear, hence no need to indicate a click + delay
      redux.getActions("mentions")?.mark(mention, id, how);
    }
  }

  function on_read_unread_click(e) {
    e.preventDefault();
    e.stopPropagation();
    markReadState(is_read ? "unread" : "read");
  }

  function on_save_unsave_click(e) {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");
    actions.markSaved(mention, id, is_saved ? "unsaved" : "saved");
  }

  function clickRow(): void {
    // Regarding chat -- if no fragment, assume chat.
    // If fragment given, then it can explicitly specify chat, e.g.,
    //    file.txt#chat=true,id=092ab039
    redux.getProjectActions(project_id).open_file({
      path: path,
      chat: !!fragmentId?.chat,
      fragmentId,
    });

    markReadState("read");
  }

  return (
    <li
      className="cocalc-notification-row-entry"
      onClick={() => clickRow()}
      style={row_style}
    >
      <div style={ACTION_ICONS_WRAPPING_STYLE}>
        <Tooltip title={`Mark this @mention as ${is_read ? "unread" : "read"}`}>
          <Icon
            name={read_icon}
            onClick={on_read_unread_click}
            style={{ fontSize: "20px", color: "rgb(100, 100, 100)" }}
          />
        </Tooltip>
      </div>
      <div style={AVATAR_WRAPPING_STYLE}>
        <Avatar account_id={source} />
      </div>
      <div style={DESCRIPTION_STYLE}>
        <strong>
          <User account_id={source} user_map={user_map} />
        </strong>{" "}
        mentioned you in the file <code>{path}</code> in the project{" "}
        <ProjectTitle project_id={project_id} />.
        {description ? (
          <StaticMarkdown
            style={{ color: "rgb(100, 100, 100)", margin: "4px 10px" }}
            value={description}
          />
        ) : (
          <br />
        )}
        <Icon name={"comment"} /> <TimeAgo date={time.getTime()} />
      </div>
      <div style={ACTION_ICONS_WRAPPING_STYLE}>
        <Tooltip
          title={
            is_saved
              ? "Remove this @mention from 'Saved for later'"
              : "Save this mention for later"
          }
        >
          <Icon
            name={BOOKMARK_ICON_NAME}
            onClick={on_save_unsave_click}
            style={{
              fontSize: "20px",
              color: "rgb(100, 100, 100)",
              backgroundColor: is_saved ? "yellow" : undefined,
              marginRight: "10px",
            }}
          />
        </Tooltip>
      </div>
    </li>
  );
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { CSS, redux } from "@cocalc/frontend/app-framework";
import { Icon, IconName, TimeAgo } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { User } from "@cocalc/frontend/users";
import { MentionInfo } from "./types";

const DESCRIPTION_STYLE: CSS = {
  flex: "1",
} as const;

const AVATAR_WRAPPING_STYLE: CSS = {
  margin: ".9em",
} as const;

const ROW_STYLE: CSS = {
  padding: "10px 5px",
} as const;

interface Props {
  id: string;
  mention: MentionInfo;
  user_map: any;
}

export function MentionRow(props: Props) {
  const { id, mention, user_map } = props;
  const { path, project_id, source, time, target, description, fragment_id } =
    mention.toJS();

  const fragmentId = Fragment.decode(fragment_id);
  const is_read = mention.getIn(["users", target, "read"]);
  const is_saved = mention.getIn(["users", target, "saved"]);

  const read_icon: IconName = is_read ? "check-square-o" : "square-o";
  const save_icon: IconName = "book";
  const row_style: CSS = is_read
    ? { ...ROW_STYLE, color: "rgb(88, 96, 105)" }
    : ROW_STYLE;

  const on_read_unread_click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");
    actions.mark(mention, id, is_read ? "unread" : "read");
  };

  const on_save_unsave_click = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const actions = redux.getActions("mentions");
    actions.markSaved(mention, id, is_saved ? "unsaved" : "saved");
  };

  return (
    <li
      className="cocalc-notification-row-entry"
      onClick={() => {
        // Regarding chat -- if no fragment, assume chat.
        // If fragment given, then it can explicitly specify chat, e.g.,
        //    file.txt#chat=true,id=092ab039
        redux.getProjectActions(project_id).open_file({
          path: path,
          chat: !fragmentId ? true : fragmentId["chat"],
          fragmentId,
        });
        // the timeout is because visually seeing the mention disappear
        // right when you click on it is disturbing.
        setTimeout(
          () => redux.getActions("mentions")?.mark(mention, id, "read"),
          1000
        );
      }}
      style={row_style}
    >
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
      <div>
        <Tooltip
          title={
            is_saved
              ? "Remove this @mention from 'Saved for later'"
              : "Save this mention for later"
          }
        >
          <Icon
            name={save_icon}
            onClick={on_save_unsave_click}
            style={{
              fontSize: "20px",
              color: "rgb(100, 100, 100)",
              backgroundColor: is_saved ? "yellow" : undefined,
              marginRight: "10px",
            }}
          />
        </Tooltip>
        <Tooltip title={`Mark this @mention as ${is_read ? "unread" : "read"}`}>
          <Icon
            name={read_icon}
            onClick={on_read_unread_click}
            style={{ fontSize: "20px", color: "rgb(100, 100, 100)" }}
          />
        </Tooltip>
      </div>
    </li>
  );
}

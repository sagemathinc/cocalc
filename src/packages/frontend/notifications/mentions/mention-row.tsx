/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import { MentionInfo } from "./types";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { Icon, IconName, TimeAgo } from "@cocalc/frontend/components";
import { User } from "@cocalc/frontend/users";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { Tooltip } from "antd";

export function MentionRow({
  id,
  mention,
  user_map,
}: {
  id: string;
  mention: MentionInfo;
  user_map: any;
}) {
  const { path, project_id, source, time, target, description, fragment_id } =
    mention.toJS();

  const fragmentId = Fragment.decode(fragment_id);
  const is_read = mention.getIn(["users", target, "read"]);
  const is_saved = mention.getIn(["users", target, "saved"]);
  let read_icon: IconName = "square-o";
  let save_icon: IconName = "book";
  let row_style: CSSProperties = {};

  if (is_read) {
    read_icon = "check-square-o";
    row_style = {
      color: "rgb(88, 96, 105)",
    };
  }

  if (is_saved) {
    save_icon = "book";
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
    <li
      className="cocalc-highlight-on-hover"
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
          () => redux.getActions("mentions")?.mark_read(mention, id),
          1000
        );
      }}
      style={row_style}
    >
      <div style={avatar_wrapping_style}>
        <Avatar account_id={source} />
      </div>
      <div style={description_style}>
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

const description_style: CSSProperties = { flex: "1" };
const avatar_wrapping_style: CSSProperties = {
  margin: ".9em",
};

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, React, useRedux } from "../app-framework";
import { html_to_text } from "../misc";

interface Props {
  project_id: string;
  handle_click?: (e?) => void;
  style?: React.CSSProperties;
  noClick?: boolean;
}

export const ProjectTitle: React.FC<Props> = ({
  project_id,
  handle_click,
  style,
  noClick,
}) => {
  const title = useRedux(["projects", "project_map", project_id, "title"]);
  const avatar = useRedux([
    "projects",
    "project_map",
    project_id,
    "avatar_image_tiny",
  ]);

  function onClick(e): void {
    if (noClick) return;
    if (handle_click != null) {
      handle_click(e);
    } else {
      // fallback behavior
      redux.getActions("projects").open_project({ project_id });
    }
  }

  if (title == null) {
    // if we don't know the title...
    return <span style={style}>(Private project)</span>;
  }

  const body = (
    <>
      {avatar && <img src={avatar} style={{ width: "24px", height: "24px" }} />}{" "}
      {html_to_text(title)}
    </>
  );
  if (noClick) return <span style={style}>{body}</span>;

  return (
    <a onClick={onClick} style={style} role="button">
      {body}
    </a>
  );
};

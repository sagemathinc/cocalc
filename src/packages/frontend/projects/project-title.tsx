/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Avatar } from "antd";

import { React, redux, useRedux } from "@cocalc/frontend/app-framework";
import { html_to_text } from "../misc";
import * as misc from "@cocalc/util/misc";

interface Props {
  project_id: string;
  handle_click?: (e?) => void;
  style?: React.CSSProperties;
  noClick?: boolean;
  trunc?: number;
}

export const ProjectTitle: React.FC<Props> = ({
  project_id,
  handle_click,
  style,
  noClick = false,
  trunc,
}: Props) => {
  const title = useRedux(["projects", "project_map", project_id, "title"]);

  const avatar = useRedux([
    "projects",
    "project_map",
    project_id,
    "avatar_image_tiny",
  ]);

  function onClick(e): void {
    if (noClick) return;
    if (typeof handle_click === "function") {
      handle_click(e);
    } else {
      // fallback behavior
      redux.getActions("projects").open_project({ project_id });
    }
  }

  if (title == null) {
    // if we don't know the title.
    setTimeout(() => {
      // try to load all projects
      redux.getActions("projects").load_all_projects();
    }, 1);
    return <span style={style}>(Private project)</span>;
  }

  const body = (
    <>
      {avatar && (
        <Avatar shape="circle" icon={<img src={avatar} />} size={20} />
      )}{" "}
      {html_to_text(trunc ? misc.trunc(title, trunc) : title)}
    </>
  );

  if (noClick) return <span style={style}>{body}</span>;

  return (
    <a onClick={onClick} style={style} role="button">
      {body}
    </a>
  );
};

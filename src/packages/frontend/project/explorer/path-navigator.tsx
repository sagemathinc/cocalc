/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux, useActions } from "../../app-framework";
import { trunc_middle } from "@cocalc/util/misc";
import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumb } from "antd";
import { PathSegmentLink } from "./path-segment-link";

interface Props {
  project_id: string;
  style?: React.CSSProperties;
}

// This path consists of several PathSegmentLinks
export const PathNavigator: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, style } = props;
  const current_path = useTypedRedux({ project_id }, "current_path");
  const history_path = useTypedRedux({ project_id }, "history_path");
  const actions = useActions({ project_id });

  function make_path(): JSX.Element[] {
    const v: JSX.Element[] = [];

    const current_path_depth =
      (current_path == "" ? 0 : current_path.split("/").length) - 1;
    const history_segments = history_path.split("/");
    const is_root = current_path[0] === "/";

    v.push(
      // yes, must be called as a normal function. The reason is
      // because the antd Breadcrumb component requires
      // that its children are of the type of component
      // returned by PathSegmentLink, so we can't wrap that
      // in a <PathSegmentLink...>.  If you don't do this,
      // you'll get a runtime warning.
      PathSegmentLink({
        path: "",
        display: <HomeOutlined />,
        full_name: "",
        key: 0,
        on_click: () => actions?.open_directory("", true, false),
      })
    );

    history_segments.forEach((segment, i) => {
      if (is_root && i === 0) return;
      const is_current = i === current_path_depth;
      const is_history = i > current_path_depth;
      v.push(
        // yes, must be called as a normal function.
        PathSegmentLink({
          path: history_segments.slice(0, i + 1 || undefined).join("/"),
          display: trunc_middle(segment, 15),
          full_name: segment,
          key: i + 1,
          on_click: (path) => actions?.open_directory(path, true, false),
          active: is_current,
          history: is_history,
        })
      );
    });
    return v;
  }

  // Background color is set via .cc-project-files-path-nav > nav
  // so that things look good even for multiline long paths.
  return (
    <Breadcrumb style={style} className="cc-path-navigator">
      {make_path()}
    </Breadcrumb>
  );
});

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumb } from "antd";

import {
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { trunc_middle } from "@cocalc/util/misc";
import { createPathSegmentLink } from "./path-segment-link";

interface Props {
  project_id: string;
  style?: React.CSSProperties;
  className?: string;
  mode?: "files" | "flyout";
}

// This path consists of several PathSegmentLinks
export const PathNavigator: React.FC<Props> = React.memo(
  (props: Readonly<Props>) => {
    const {
      project_id,
      style,
      className = "cc-path-navigator",
      mode = "files",
    } = props;
    const current_path = useTypedRedux({ project_id }, "current_path");
    const history_path = useTypedRedux({ project_id }, "history_path");
    const actions = useActions({ project_id });

    function make_path() {
      const v: any[] = [];

      const current_path_depth =
        (current_path == "" ? 0 : current_path.split("/").length) - 1;
      const history_segments = history_path.split("/");
      const is_root = current_path[0] === "/";

      v.push(
        createPathSegmentLink({
          path: "",
          display: <HomeOutlined style={{ fontSize: style?.fontSize }} />,
          full_name: "",
          key: 0,
          on_click: () => actions?.open_directory("", true, false),
          active: current_path_depth === -1,
        })
      );

      const pathLen = current_path_depth;
      const condense = mode === "flyout";

      history_segments.forEach((segment, i) => {
        if (is_root && i === 0) return;
        const is_current = i === current_path_depth;
        const is_history = i > current_path_depth;

        // don't show too much in flyout mode
        const hide =
          condense &&
          ((i < pathLen && i <= pathLen - 2) ||
            (i > pathLen && i >= pathLen + 2));

        v.push(
          // yes, must be called as a normal function.
          createPathSegmentLink({
            path: history_segments.slice(0, i + 1 || undefined).join("/"),
            display: hide ? <>&bull;</> : trunc_middle(segment, 15),
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
      <Breadcrumb style={style} className={className} items={make_path()} />
    );
  }
);

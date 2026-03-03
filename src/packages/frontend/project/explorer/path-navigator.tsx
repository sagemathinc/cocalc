/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { HomeOutlined } from "@ant-design/icons";
import { Breadcrumb, Button, Flex, Tooltip } from "antd";

import {
  CSS,
  React,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { trunc_middle } from "@cocalc/util/misc";
import { createPathSegmentLink } from "./path-segment-link";

interface Props {
  project_id: string;
  style?: React.CSSProperties;
  className?: string;
  mode?: "files" | "flyout";
  /**
   * Override the browsing path shown in the breadcrumb.
   * When omitted, reads `current_path` from the Redux store.
   */
  currentPath?: string;
  /**
   * Override the history path used for breadcrumb depth.
   * When omitted, reads `history_path` from the Redux store.
   */
  historyPath?: string;
  /**
   * Called instead of `actions.open_directory` when the user clicks a
   * breadcrumb segment or the up/home buttons.  When omitted, falls
   * back to `actions.open_directory(path, true, false)`.
   */
  onNavigate?: (path: string) => void;
}

// This path consists of several PathSegmentLinks
export const PathNavigator: React.FC<Props> = React.memo(
  (props: Readonly<Props>) => {
    const {
      project_id,
      style,
      className = "cc-path-navigator",
      mode = "files",
      onNavigate,
    } = props;
    const reduxCurrentPath = useTypedRedux({ project_id }, "current_path");
    const reduxHistoryPath = useTypedRedux({ project_id }, "history_path");
    const actions = useActions({ project_id });

    const currentPath = props.currentPath ?? reduxCurrentPath;
    const historyPath = props.historyPath ?? reduxHistoryPath;

    const navigate = (path: string) => {
      if (onNavigate) {
        onNavigate(path);
      } else {
        actions?.open_directory(path, true, false);
      }
    };

    function make_path() {
      const v: any[] = [];

      const currentPathDepth =
        (currentPath == "" ? 0 : currentPath.split("/").length) - 1;
      const historySegments = historyPath.split("/");
      const isRoot = currentPath[0] === "/";

      const homeStyle: CSS = {
        fontSize: style?.fontSize,
        fontWeight: "bold",
      } as const;

      const homeDisplay =
        mode === "files" ? (
          <>
            <HomeOutlined style={homeStyle} />{" "}
            <span style={homeStyle}>Home</span>
          </>
        ) : (
          <HomeOutlined style={homeStyle} />
        );

      v.push(
        createPathSegmentLink({
          path: "",
          display: (
            <Tooltip title="Go to home directory">{homeDisplay}</Tooltip>
          ),
          full_name: "",
          key: 0,
          on_click: () => navigate(""),
          active: currentPathDepth === -1,
          dndNamespace: mode,
        }),
      );

      const pathLen = currentPathDepth;
      const condense = mode === "flyout";

      historySegments.forEach((segment, i) => {
        if (isRoot && i === 0) return;
        const is_current = i === currentPathDepth;
        const is_history = i > currentPathDepth;

        // don't show too much in flyout mode
        const hide =
          condense &&
          ((i < pathLen && i <= pathLen - 2) ||
            (i > pathLen && i >= pathLen + 2));

        v.push(
          // yes, must be called as a normal function.
          createPathSegmentLink({
            path: historySegments.slice(0, i + 1 || undefined).join("/"),
            display: hide ? <>&bull;</> : trunc_middle(segment, 15),
            full_name: segment,
            key: i + 1,
            on_click: (path) => navigate(path),
            active: is_current,
            history: is_history,
            dndNamespace: mode,
          }),
        );
      });
      return v;
    }

    function renderUP() {
      const canGoUp = currentPath !== "";

      return (
        <Button
          icon={<Icon name="arrow-circle-up" />}
          type="text"
          onClick={() => {
            if (!canGoUp) return;
            const pathSegments = currentPath.split("/");
            pathSegments.pop();
            const parentPath = pathSegments.join("/");
            navigate(parentPath);
          }}
          disabled={!canGoUp}
          title={canGoUp ? "Go up one directory" : "Already at home directory"}
        />
      );
    }

    // Background color is set via .cc-project-files-path-nav > nav
    // so that things look good even for multiline long paths.
    const bc = (
      <Breadcrumb style={style} className={className} items={make_path()} />
    );
    return mode === "files" ? (
      <Flex justify="space-between" align="center" style={{ width: "100%" }}>
        <div style={{ flex: 1, minWidth: 0 }}>{bc}</div>
        {renderUP()}
      </Flex>
    ) : (
      bc
    );
  },
);

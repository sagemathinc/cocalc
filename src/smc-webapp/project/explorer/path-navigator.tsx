/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useTypedRedux, useActions } from "../../app-framework";
import { PathSegmentLink } from "./path-segment-link";
import { Icon } from "../../r_misc";
import { trunc_middle } from "smc-util/misc";
import { Breadcrumb } from "react-bootstrap";

// This path consists of several PathSegmentLinks
export function PathNavigator({
  project_id,
  style,
}: {
  project_id: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const current_path = useTypedRedux({ project_id }, "current_path");
  const history_path = useTypedRedux({ project_id }, "history_path");
  const actions = useActions({ project_id });

  function make_path(): JSX.Element[] {
    const v: JSX.Element[] = [];
    v.push(
      <PathSegmentLink
        path=""
        display={<Icon name="home" />}
        full_name={""}
        key={0}
        on_click={() => actions?.open_directory("", true, false)}
      />
    );

    const is_root = current_path[0] === "/";

    const current_path_depth =
      (current_path == "" ? 0 : current_path.split("/").length) - 1;
    const history_segments = history_path.split("/");
    history_segments.forEach((segment, i) => {
      if (is_root && i === 0) return;
      const is_current = i === current_path_depth;
      const is_history = i > current_path_depth;
      v.push(
        <PathSegmentLink
          path={history_segments.slice(0, +i + 1 || undefined).join("/")}
          display={trunc_middle(segment, 15)}
          full_name={segment}
          key={i + 1}
          on_click={(path) => actions?.open_directory(path, true, false)}
          active={is_current}
          history={is_history}
        />
      );
    });
    return v;
  }

  // The lineHeight below is needed for very long paths that make it wrap around
  // to the next line.  Without that, it overlaps and cuts the letters off.
  return (
    <Breadcrumb
      style={{ ...{ marginBottom: "0", lineHeight: "58px" }, ...style }}
    >
      {make_path()}
    </Breadcrumb>
  );
}

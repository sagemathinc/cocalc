import * as React from "react";
import { PathSegmentLink } from "./path-segment-link";
import { Icon } from "../../r_misc";
import { ProjectActions } from "smc-webapp/project_store";

const misc = require("smc-util/misc");
const Breadcrumb = require("react-bootstrap");

interface Props {
  current_path: string;
  history_path: string;
  actions: ProjectActions;
}

// This path consists of several PathSegmentLinks
export function PathNavigator({
  current_path,
  history_path = "",
  actions
}: Props): JSX.Element {
  function make_path(): JSX.Element[] {
    const v: JSX.Element[] = [];
    v.push(
      <PathSegmentLink
        path=""
        display={<Icon name="home" />}
        key={0}
        on_click={actions.open_directory}
      />
    );

    const is_root = current_path[0] === "/";

    const current_path_depth =
      current_path == "" ? 0 : current_path.split("/").length - 1;
    const history_segments = history_path.split("/");
    for (let i = 0; i < history_segments.length; i++) {
      const segment = history_segments[i];
      if (is_root && i === 0) {
        continue;
      }
      const is_current = i === current_path_depth;
      const is_history = i > current_path_depth;
      v.push(
        <PathSegmentLink
          path={history_segments.slice(0, +i + 1 || undefined).join("/")}
          display={misc.trunc_middle(segment, 15)}
          full_name={segment}
          key={i + 1}
          on_click={actions.open_directory}
          active={is_current}
          history={is_history}
        />
      );
    }
    return v;
  }

  return (
    <Breadcrumb bsSize="small" style={{ marginBottom: "0" }}>
      {make_path()}
    </Breadcrumb>
  );
}

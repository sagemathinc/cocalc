/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { OverlayTrigger, Tooltip } from "react-bootstrap";
import { trunc_middle, merge, ensure_bound } from "smc-util/misc";
import { webapp_client } from "../../webapp-client";
import { React, redux, useRedux } from "../../app-framework";
import { Loading, Space } from "../../r_misc";
import { avatar_fontcolor } from "./font-color";
import { ProjectTitle } from "../../projects/project-title";

const CIRCLE_OUTER_STYLE = {
  textAlign: "center",
  cursor: "pointer",
};

const CIRCLE_INNER_STYLE = {
  display: "block",
  borderRadius: "50%",
  fontFamily: "sans-serif",
};

interface Props {
  account_id: string;
  size?: number;
  max_age_s?: number;
  project_id?: string; // if given, showing avatar info for a project (or specific file)
  path?: string; // if given, showing avatar for a specific file

  // if given; is most recent activity
  activity?: { project_id: string; path: string; last_used: Date };
  // When defined, fade out over time; click goes to that file.
  no_tooltip?: boolean; // if true, do not show a tooltip with full name info
  no_loading?: boolean; // if true, do not show a loading indicator (show nothing)
}

export const Avatar: React.FC<Props> = (props) => {
  // we use this to display the username and face:
  const user_map: Map<string, any> = useRedux(["users", "user_map"]);

  function click_avatar() {
    if (props.activity == null) {
      return;
    }
    const { project_id, path } = props.activity;
    switch (viewing_what()) {
      case "projects":
        redux.getActions("projects").open_project({
          project_id,
          target: "files",
          switch_to: true,
        });
        return;
      case "project":
        redux.getProjectActions(project_id).open_file({ path });
        return;
      case "file":
        var line = get_cursor_line();
        if (line != null) {
          redux.getProjectActions(project_id).goto_line(path, line);
        }
        return;
    }
  }

  function letter() {
    const first_name = user_map.getIn([props.account_id, "first_name"]);
    if (first_name) {
      return first_name.toUpperCase()[0];
    } else {
      return "?";
    }
  }

  function get_name() {
    return trunc_middle(
      redux.getStore("users").get_name(props.account_id)?.trim(),
      20
    );
  }

  function get_background_color() {
    return redux.getStore("users").get_color(props.account_id);
  }

  function get_image() {
    return redux.getStore("users").get_image(props.account_id);
  }

  function viewing_what() {
    if (props.path != null && props.project_id != null) {
      return "file";
    } else if (props.project_id != null) {
      return "project";
    } else {
      return "projects";
    }
  }

  function render_line() {
    if (props.activity == null) {
      return;
    }
    const line = get_cursor_line();
    if (line != null) {
      return (
        <span>
          <Space /> (Line {line})
        </span>
      );
    }
  }

  function get_cursor_line() {
    if (props.activity == null) {
      return;
    }
    const { project_id, path } = props.activity;
    let cursors = redux
      .getProjectStore(project_id)
      .get_users_cursors(path, props.account_id);
    if (cursors == null) {
      return;
    }
    // TODO -- will just assume immutable.js when react/typescript rewrite is done.
    if (cursors.toJS != null) {
      cursors = cursors.toJS();
    }
    const line = cursors[0] != null ? cursors[0]["y"] : undefined;
    if (line != null) {
      return line + 1;
    } else {
      return undefined;
    }
  }

  function render_tooltip_content() {
    const name = get_name();
    if (props.activity == null) {
      return <span>{name}</span>;
    }
    switch (viewing_what()) {
      case "projects":
        return (
          <span>
            {name} last seen at{" "}
            <ProjectTitle project_id={props.activity.project_id} />
          </span>
        );
      case "project":
        return (
          <span>
            {name} last seen at {props.activity.path}
          </span>
        );
      case "file":
        return (
          <span>
            {name} {render_line()}
          </span>
        );
    }
  }

  function render_tooltip() {
    return <Tooltip id={props.account_id}>{render_tooltip_content()}</Tooltip>;
  }

  function render_inside() {
    const url = get_image();
    if (url) {
      return render_image(url);
    } else {
      return render_letter();
    }
  }

  function render_image(url) {
    return (
      <img
        style={{ borderRadius: "50%", width: "100%", verticalAlign: "top" }}
        src={url}
      />
    );
  }

  function render_letter() {
    const backgroundColor = get_background_color();
    const color = avatar_fontcolor(backgroundColor);
    const style = {
      backgroundColor, // onecolor doesn't provide magenta in some browsers
      color,
    };
    return <span style={merge(style, CIRCLE_INNER_STYLE)}>{letter()}</span>;
  }

  function fade() {
    if (props.activity == null || !props.max_age_s) {
      return 1;
    }
    const { last_used } = props.activity;
    // don't fade out completely as then just see an empty face, which looks broken...
    return ensure_bound(
      1 -
        (webapp_client.server_time().valueOf() - last_used.valueOf()) /
          (props.max_age_s * 1000),
      0,
      0.85
    );
  }

  // TODO: When TS this file, use profile-icon in r_misc
  // for code reusability! (eg. We might want lighter weight icon some places)
  if (user_map == null) {
    return <Loading />;
  }

  const { size } = props;
  if (size == null) throw Error("bug");
  const outer_style = {
    height: `${size}px`,
    width: `${size}px`,
    lineHeight: `${size}px`,
    fontSize: `${0.7 * size}px`,
    opacity: fade(),
  };

  const elt = (
    <div style={{ display: "inline-block", cursor: "pointer" }}>
      <div
        style={merge(outer_style, CIRCLE_OUTER_STYLE)}
        onClick={click_avatar}
      >
        {render_inside()}
      </div>
    </div>
  );
  if (props.no_tooltip) {
    return elt;
  } else {
    return (
      <OverlayTrigger placement="top" overlay={render_tooltip()}>
        {elt}
      </OverlayTrigger>
    );
  }
};

Avatar.defaultProps = { size: 30, max_age_s: 600 };

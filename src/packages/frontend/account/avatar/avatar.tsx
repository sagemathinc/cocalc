/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";
import { CSSProperties, useState } from "react";

import { isChatBot } from "@cocalc/frontend/account/chatbot";
import {
  React,
  redux,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Gap } from "@cocalc/frontend/components";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { DEFAULT_COLOR } from "@cocalc/frontend/users/store";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { service2model } from "@cocalc/util/db-schema/llm-utils";
import { ensure_bound, startswith, trunc_middle } from "@cocalc/util/misc";
import { avatar_fontcolor } from "./font-color";

const CIRCLE_OUTER_STYLE: CSSProperties = {
  textAlign: "center",
  cursor: "pointer",
} as const;

const CIRCLE_INNER_STYLE: CSSProperties = {
  display: "block",
  borderRadius: "50%",
  fontFamily: "sans-serif",
} as const;

interface Props {
  account_id?: string; // if not given useful as a placeholder in the UI (e.g., if we don't know account_id yet); uuid or "chatgpt" or "openai-[model]".
  size?: number; // in pixels
  max_age_s?: number; // if given fade the avatar out over time.
  project_id?: string; // if given, showing avatar info for a project (or specific file)
  path?: string; // if given, showing avatar for a specific file

  // if given; is most recent activity
  activity?: { project_id: string; path: string; last_used: Date };
  // When defined, fade out over time; click goes to that file.
  no_tooltip?: boolean; // if true, do not show a tooltip with full name info
  no_loading?: boolean; // if true, do not show a loading indicator (show nothing)

  first_name?: string; // optional name to use
  last_name?: string;
  style?: CSSProperties;
}

export function Avatar(props) {
  if (isChatBot(props.account_id)) {
    return (
      <LanguageModelVendorAvatar
        model={service2model(props.account_id)}
        size={props.size ?? 30}
        style={props.style}
      />
    );
  } else {
    return <Avatar0 {...props} />;
  }
}

const Avatar0: React.FC<Props> = (props) => {
  // we use the user_map to display the username and face:
  const user_map = useTypedRedux("users", "user_map");
  const [image, set_image] = useState<string | undefined>(undefined);
  const [background_color, set_background_color] =
    useState<string>(DEFAULT_COLOR);

  useAsyncEffect(
    async (isMounted) => {
      if (!props.account_id) return;
      const image = await redux.getStore("users").get_image(props.account_id);
      if (isMounted()) {
        if (startswith(image, "https://api.adorable.io")) {
          // Adorable is gone -- see https://github.com/sagemathinc/cocalc/issues/5054
          set_image(undefined);
        } else {
          set_image(image);
        }
      }
      const background_color = await redux
        .getStore("users")
        .get_color(props.account_id);
      if (isMounted()) {
        set_background_color(background_color);
      }
    }, // Update image and/or color if the account_id changes *or* the profile itself changes:
    //    https://github.com/sagemathinc/cocalc/issues/5013
    [props.account_id, user_map.getIn([props.account_id, "profile"])],
  );

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
        const actions = redux.getEditorActions(project_id, path);
        // actions could be undefined, if file is closed
        const gotoUser = actions?.["gotoUser"];
        if (gotoUser != null) {
          // This is at least implemented for the whiteboard (which doesn't
          // have a good notion of lines), but should be done more
          // generally, replacing the stuff below about cursor_line...
          gotoUser(props.account_id);
          return;
        }
        var line = get_cursor_line();
        if (line != null) {
          redux.getProjectActions(project_id).goto_line(path, line);
        }
        return;
    }
  }

  function letter() {
    if (props.first_name) {
      return props.first_name.toUpperCase()[0];
    }
    if (!props.account_id) return "?";
    const first_name = user_map.getIn([props.account_id, "first_name"]);
    if (first_name) {
      return first_name.toUpperCase()[0];
    } else {
      return "?";
    }
  }

  function get_name() {
    if (props.first_name != null || props.last_name != null) {
      return trunc_middle(
        `${props.first_name ?? ""} ${props.last_name ?? ""}`.trim(),
        30,
      );
    }
    if (!props.account_id) return "Unknown";
    return trunc_middle(
      redux.getStore("users").get_name(props.account_id)?.trim(),
      30,
    );
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
          <Gap /> (Line {line})
        </span>
      );
    }
  }

  function get_cursor_line() {
    if (props.activity == null || props.account_id == null) {
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

  function render_inside() {
    if (image) {
      return <img style={{ borderRadius: "50%", width: "100%" }} src={image} />;
    } else {
      return render_letter();
    }
  }

  function render_letter() {
    const color = avatar_fontcolor(background_color);
    const style = {
      backgroundColor: background_color, // the onecolor library doesn't provide magenta in some browsers
      color,
    };
    return <span style={{ ...style, ...CIRCLE_INNER_STYLE }}>{letter()}</span>;
  }

  const { max_age_s = 600 } = props;

  function fade() {
    if (props.activity == null || !max_age_s) {
      return 1;
    }
    const { last_used } = props.activity;
    // don't fade out completely as then just see an empty face, which looks broken...
    return ensure_bound(
      1 -
        (webapp_client.server_time().valueOf() - last_used.valueOf()) /
          (max_age_s * 1000),
      0,
      0.85,
    );
  }

  const { size = 30 } = props;
  if (size == null) {
    throw Error("bug");
  }
  const outer_style = {
    height: `${size}px`,
    width: `${size}px`,
    lineHeight: `${size}px`,
    fontSize: `${0.7 * size}px`,
    opacity: fade(),
  };

  // we put avatars inside <p>'s in some cases so do not use divs here.
  const elt = (
    <span
      style={{
        display: "inline-block",
        ...outer_style,
        ...CIRCLE_OUTER_STYLE,
        ...props.style,
      }}
      onClick={click_avatar}
    >
      {render_inside()}
    </span>
  );
  if (props.no_tooltip) {
    return elt;
  } else {
    return <Tooltip title={render_tooltip_content()}>{elt}</Tooltip>;
  }
};

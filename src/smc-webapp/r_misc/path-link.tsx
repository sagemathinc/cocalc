/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, redux } from "../app-framework";
import {
  endswith,
  path_split,
  separate_file_extension,
  should_open_in_foreground,
  trunc_middle,
} from "smc-util/misc";
import { Tip } from "./tip";

interface Props {
  path: string;
  project_id: string;
  display_name?: string; // if provided, show this as the link and show real name in popover
  full?: boolean; // true = show full path, false = show only basename
  trunc?: number; // truncate longer names and show a tooltip with the full name
  style?: React.CSSProperties;
  link?: boolean; // set to false to make it not be a link
}

// Component to attempt opening a cocalc path in a project
export const PathLink: React.FC<Props> = (props) => {
  function handle_click(e): void {
    e.preventDefault();
    const switch_to = should_open_in_foreground(e);
    redux.getProjectActions(props.project_id).open_file({
      path: props.path,
      foreground: switch_to,
      foreground_project: switch_to,
    });
  }

  function render_link(text): JSX.Element {
    let s;
    if (!endswith(text, "/")) {
      const { name, ext } = separate_file_extension(text);
      if (ext) {
        s = (
          <>
            {name}
            <span style={{ color: "#999" }}>.{ext}</span>
          </>
        );
      } else {
        s = name;
      }
    } else {
      s = text;
    }
    if (props.link) {
      return (
        <a onClick={handle_click} style={props.style}>
          {s}
        </a>
      );
    } else {
      return <span style={props.style}>{s}</span>;
    }
  }

  const name = props.full ? props.path : path_split(props.path).tail;
  if (
    (props.trunc != null && name.length > props.trunc) ||
    (props.display_name != null && props.display_name !== name)
  ) {
    let text;
    if (props.trunc != null) {
      text = trunc_middle(
        props.display_name != null ? props.display_name : name,
        props.trunc
      );
    } else {
      text = props.display_name != null ? props.display_name : name;
    }
    return (
      <Tip title="" tip={name}>
        {render_link(text)}
      </Tip>
    );
  } else {
    return render_link(name);
  }
};

PathLink.defaultProps = {
  style: {},
  full: false,
  link: true,
};

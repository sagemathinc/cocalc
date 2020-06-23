/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, redux } from "../app-framework";
import {
  path_split,
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
export class PathLink extends Component<Props> {
  static defaultProps = {
    style: {},
    full: false,
    link: true,
  };

  private handle_click(e): void {
    e.preventDefault();
    const switch_to = should_open_in_foreground(e);
    redux.getProjectActions(this.props.project_id).open_file({
      path: this.props.path,
      foreground: switch_to,
      foreground_project: switch_to,
    });
  }

  private render_link(text): JSX.Element {
    if (this.props.link) {
      return (
        <a
          onClick={this.handle_click.bind(this)}
          style={this.props.style}
          href=""
        >
          {text}
        </a>
      );
    } else {
      return <span style={this.props.style}>{text}</span>;
    }
  }

  public render(): JSX.Element {
    const name = this.props.full
      ? this.props.path
      : path_split(this.props.path).tail;
    if (
      (this.props.trunc != null && name.length > this.props.trunc) ||
      (this.props.display_name != null && this.props.display_name !== name)
    ) {
      let text;
      if (this.props.trunc != null) {
        text = trunc_middle(
          this.props.display_name != null ? this.props.display_name : name,
          this.props.trunc
        );
      } else {
        text = this.props.display_name != null ? this.props.display_name : name;
      }
      return (
        <Tip title="" tip={name}>
          {this.render_link(text)}
        </Tip>
      );
    } else {
      return this.render_link(name);
    }
  }
}

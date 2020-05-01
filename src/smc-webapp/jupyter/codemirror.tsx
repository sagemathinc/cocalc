/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

*/

import { React, Component } from "../app-framework";
import { Map as ImmutableMap } from "immutable";

import { CodeMirrorEditor } from "./codemirror-editor";
import { CodeMirrorStatic } from "./codemirror-static";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

interface CodeMirrorProps {
  actions?: JupyterActions;
  frame_actions?: NotebookFrameActions;
  id: string;
  options: ImmutableMap<string, any>;
  value: string;
  font_size?: number; // not explicitly used, but critical to re-render on change so Codemirror recomputes itself!
  is_focused: boolean;
  cursors?: ImmutableMap<any, any>;
  complete?: ImmutableMap<any, any>;
  is_scrolling?: boolean;
}

interface CodeMirrorState {
  click_coords?: any;
  last_cursor?: any;
}

export class CodeMirror extends Component<CodeMirrorProps, CodeMirrorState> {
  private is_mounted: boolean;
  private has_rendered_nonstatic: boolean = false;

  constructor(props: CodeMirrorProps, context: any) {
    super(props, context);
    this.state = {
      click_coords: undefined, // coordinates if static input was just clicked on
      last_cursor: undefined,
    }; // last cursor position when editing
  }

  set_click_coords = (coords: any) => {
    this.setState({ click_coords: coords });
  };

  set_last_cursor = (pos: any) => {
    if (this.is_mounted) {
      // ignore unless mounted -- can still get called due to caching of cm editor
      this.setState({ last_cursor: pos });
    }
  };

  componentDidMount() {
    this.is_mounted = true;
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  shouldComponentUpdate(next) {
    return (
      next.id !== this.props.id ||
      next.options !== this.props.options ||
      next.value !== this.props.value ||
      next.font_size !== this.props.font_size ||
      next.is_focused !== this.props.is_focused ||
      next.is_scrolling !== this.props.is_scrolling ||
      next.cursors !== this.props.cursors ||
      next.complete !== this.props.complete
    );
  }

  render() {
    // Regarding IS_TOUCH, see https://github.com/sagemathinc/cocalc/issues/2584 -- fix that properly and then
    // we can remove this use of the slower non-static fallback...
    if (
      (this.has_rendered_nonstatic || !this.props.is_scrolling) &&
      this.props.actions != null &&
      this.props.frame_actions != null
    ) {
      // For some reason the static renderer has some REALLY bad performance, especially for
      // larger documents.  This may be an issue with using react at all (i.e., we should just
      // directly generate html).  For now, probably the best fix is not to use the static
      // renderer, since it causes so much trouble...
      // See https://github.com/sagemathinc/cocalc/issues/3652
      // Instead, we should optimize how the normal render works, e.g., by caching it.
      this.has_rendered_nonstatic = true;
      return (
        <CodeMirrorEditor
          actions={this.props.actions}
          frame_actions={this.props.frame_actions}
          id={this.props.id}
          options={this.props.options}
          value={this.props.value}
          font_size={this.props.font_size}
          cursors={this.props.cursors}
          click_coords={this.state.click_coords}
          set_click_coords={this.set_click_coords}
          set_last_cursor={this.set_last_cursor}
          last_cursor={this.state.last_cursor}
          is_focused={this.props.is_focused}
          is_scrolling={this.props.is_scrolling}
          complete={this.props.complete}
        />
      );
    } else {
      this.has_rendered_nonstatic = false;
      return (
        <CodeMirrorStatic
          id={this.props.id}
          options={this.props.options}
          value={this.props.value}
          font_size={this.props.font_size}
          complete={this.props.complete}
          set_click_coords={this.set_click_coords}
        />
      );
    }
  }
}

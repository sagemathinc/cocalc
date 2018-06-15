/*
Codemirror-based input cell

TODO:

 - [ ] need to merge in changes rather than just overwrite when get new changes from remote

*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";

const { CodeMirrorEditor } = require("./codemirror-editor");
const { CodeMirrorStatic } = require("./codemirror-static");
const { IS_TOUCH } = require("../feature");

interface CodeMirrorProps {
  actions?: any;
  id: string;
  options: ImmutableMap<any, any>;
  value: string;
  font_size?: number; // not explicitly used, but critical to re-render on change so Codemirror recomputes itself!
  is_focused: boolean;
  cursors?: ImmutableMap<any, any>;
  complete?: ImmutableMap<any, any>;
}

interface CodeMirrorState {
  click_coords?: any;
  last_cursor?: any;
}

export class CodeMirror extends Component<CodeMirrorProps, CodeMirrorState> {
  private _is_mounted: boolean; // DONT DO THIS
  constructor(props: CodeMirrorProps, context: any) {
    super(props, context);
    this.state = {
      click_coords: undefined, // coordinates if static input was just clicked on
      last_cursor: undefined
    }; // last cursor position when editing
  }

  set_click_coords = (coords: any) => {
    this.setState({ click_coords: coords });
  };

  set_last_cursor = (pos: any) => {
    if (this._is_mounted) {
      // ignore unless mounted -- can still get called due to caching of cm editor
      this.setState({ last_cursor: pos });
    }
  };

  componentDidMount() {
    // TODO: don't do this
    this._is_mounted = true;
  }

  componentWillUnmount() {
    // TODO: don't do this
    this._is_mounted = false;
  }

  shouldComponentUpdate(next) {
    return (
      next.id !== this.props.id ||
      next.options !== this.props.options ||
      next.value !== this.props.value ||
      next.font_size !== this.props.font_size ||
      next.is_focused !== this.props.is_focused ||
      next.cursors !== this.props.cursors ||
      next.complete !== this.props.complete
    );
  }

  render() {
    // Regarding IS_TOUCH, see https://github.com/sagemathinc/cocalc/issues/2584 -- fix that properly and then
    // we can remove this use of the slower non-static fallback...
    if (
      this.props.actions != null &&
      (IS_TOUCH ||
        this.props.is_focused ||
        this.props.options.get("lineNumbers") ||
        (this.props.cursors != null ? this.props.cursors.size : undefined) > 0)
    ) {
      return (
        <CodeMirrorEditor
          actions={this.props.actions}
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
          complete={this.props.complete}
        />
      );
    } else {
      return (
        <CodeMirrorStatic
          actions={this.props.actions}
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

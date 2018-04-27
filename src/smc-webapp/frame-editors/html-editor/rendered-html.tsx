/*
Component that shows rendered HTML.
*/

import { is_different, path_split } from "../misc";

import { Map } from "immutable";

import { throttle } from "underscore";

const { Loading, HTML } = require("smc-webapp/r_misc");

import { React, Component, Rendered, ReactDOM } from "../react";

import { MAX_WIDTH } from "./options.ts";

interface PropTypes {
  id: string;
  actions: any;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value?: string;
  content?: string; // used instead of file, if this is public.
  editor_state: Map<string, any>;
}

export class QuickHTMLPreview extends Component<PropTypes, {}> {
  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size",
      "read_only",
      "value",
      "content"
    ]);
  }

  on_scroll(): void {
    const elt = ReactDOM.findDOMNode(this.refs.scroll);
    if (elt == null) {
      return;
    }
    const scroll = $(elt).scrollTop();
    this.props.actions.save_editor_state(this.props.id, { scroll });
  }

  componentDidMount(): void {
    this.restore_scroll();
    setTimeout(() => this.restore_scroll, 200);
    setTimeout(() => this.restore_scroll, 500);
  }

  restore_scroll() {
    const scroll: number | undefined = this.props.editor_state.get("scroll");
    if (scroll !== undefined) {
      $(ReactDOM.findDOMNode(this.refs.scroll)).scrollTop(scroll);
    }
  }

  post_hook(elt) {
    //  make html even more sane for editing inside cocalc (not an iframe)
    elt.find("link").remove(); // gets rid of external CSS style
    return elt.find("style").remove();
  } // gets rid of inline CSS style

  render(): Rendered {
    const value: string | undefined =
      this.props.value === undefined ? this.props.content : this.props.value;
    // the cocalc-editor-div is needed for a safari hack only
    if (value === undefined) {
      return <Loading />;
    }
    return (
      <div
        style={{
          overflowY: "scroll",
          width: "100%",
          fontSize: `${this.props.font_size}px`
        }}
        ref={"scroll"}
        onScroll={throttle(() => this.on_scroll(), 250)}
        className={"cocalc-editor-div"}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "10px auto",
            padding: "0 10px"
          }}
        >
          <HTML
            id={`frame-${this.props.id}`}
            value={value}
            project_id={this.props.project_id}
            file_path={path_split(this.props.path).head}
            safeHTML={true}
            post_hook={this.post_hook}
          />
        </div>
      </div>
    );
  }
}

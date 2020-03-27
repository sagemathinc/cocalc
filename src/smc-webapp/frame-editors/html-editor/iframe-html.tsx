/*
Component that shows rendered HTML in an iFrame, so safe and no mangling needed...
*/

import * as $ from "jquery";
import { Set } from "immutable";
import { is_safari } from "../generic/browser";
import {
  change_filename_extension,
  is_different,
  list_alternatives,
} from "smc-util/misc2";
import { throttle } from "underscore";
import { Component, React, ReactDOM, Rendered } from "../../app-framework";

import * as CSS from "csstype";

const STYLE: CSS.Properties = {
  overflowY: "auto",
  width: "100%",
};

interface PropTypes {
  id: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  fullscreen_style?: any;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;
  mode: "rmd" | undefined;
  style?: any;
  derived_file_types: Set<string>;
} // style should be static; change does NOT cause update.

export class IFrameHTML extends Component<PropTypes, {}> {
  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "reload",
      "font_size",
      "derived_file_types",
    ]);
  }

  componentWillReceiveProps(next): void {
    if (this.props.reload !== next.reload) {
      this.reload_iframe();
    }
    if (this.props.font_size !== next.font_size) {
      this.set_iframe_style(next.font_size);
    }
  }

  componentDidMount(): void {
    this.safari_hack();
    this.set_iframe_style(this.props.font_size);
  }

  on_scroll(): void {
    const elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null) {
      return;
    }
    const scroll = $(elt).contents().scrollTop();
    this.props.actions.save_editor_state(this.props.id, { scroll });
  }

  init_scroll_handler(): void {
    const node = ReactDOM.findDOMNode(this.refs.iframe);
    if (node != null && node.contentDocument != null) {
      node.contentDocument.addEventListener(
        "scroll",
        throttle(() => this.on_scroll(), 150)
      );
    }
  }

  click_iframe(): void {
    this.props.actions.set_active_id(this.props.id);
  }

  init_click_handler(): void {
    const node = ReactDOM.findDOMNode(this.refs.iframe);
    if (node != null && node.contentDocument != null) {
      node.contentDocument.addEventListener("click", () => this.click_iframe());
    }
  }

  restore_scroll() {
    const scroll: number | undefined = this.props.editor_state.get("scroll");
    if (scroll === undefined) return;
    let elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null) {
      return;
    }
    elt = $(elt);
    if (scroll != null) {
      elt.contents().scrollTop(scroll);
    }
    elt.css("opacity", 1);
  }

  render_iframe() {
    let path = this.props.path;
    if (
      this.props.mode == "rmd" &&
      this.props.derived_file_types != undefined
    ) {
      if (this.props.derived_file_types.contains("html")) {
        // keep path as it is; don't remove this case though because of the else
      } else if (this.props.derived_file_types.contains("nb.html")) {
        path = change_filename_extension(path, "nb.html");
      } else {
        return this.render_no_html();
      }
    }

    // param below is just to avoid caching.
    const src_url = `${window.app_base_url}/${this.props.project_id}/raw/${path}?param=${this.props.reload}`;

    return (
      <iframe
        ref={"iframe"}
        src={src_url}
        width={"100%"}
        height={"100%"}
        style={{ border: 0, opacity: 0 }}
        onLoad={() => {
          this.set_iframe_style();
          this.restore_scroll();
          this.init_scroll_handler();
          this.init_click_handler();
        }}
      />
    );
  }

  reload_iframe(): void {
    const elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null) {
      return;
    }
    $(elt).css("opacity", 0);
    elt.contentDocument.location.reload(true);
  }

  set_iframe_style(font_size?: number): void {
    const elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null) {
      return;
    }
    const j = $(elt);
    j.css("opacity", 1);
    const body = j.contents().find("body");
    body.css("zoom", (font_size != null ? font_size : 16) / 16);
    if (this.props.is_fullscreen && this.props.fullscreen_style != null) {
      body.css(this.props.fullscreen_style);
    }
  }

  maximize(): void {
    this.props.actions.set_frame_full(this.props.id);
  }

  safari_hack(): void {
    if (is_safari()) {
      $(ReactDOM.findDOMNode(this)).make_height_defined();
    }
  }

  render_no_html(): Rendered {
    return (
      <div>
        <p>There is no rendered HTML file available.</p>
        {this.props.derived_file_types.size > 0 ? (
          <p>
            Instead, you might want to switch to the{" "}
            {list_alternatives(this.props.derived_file_types)} view by selecting
            it via the dropdown selector in the button row above.
          </p>
        ) : (
          ""
        )}
      </div>
    );
  }

  render(): Rendered {
    // the cocalc-editor-div is needed for a safari hack only
    return (
      <div style={STYLE} className={"cocalc-editor-div smc-vfill"}>
        {this.render_iframe()}
      </div>
    );
  }
}

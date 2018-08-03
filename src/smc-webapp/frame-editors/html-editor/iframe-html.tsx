/*
Component that shows rendered HTML in an iFrame, so safe and no mangling needed...
*/

import * as $ from "jquery";

import {is_safari} from "../generic/browser";

import { is_different } from "../generic/misc";

import { throttle } from "underscore";

import { Component, React, ReactDOM, Rendered } from "../../app-framework";

import * as CSS from "csstype";

const STYLE: CSS.Properties = {
  overflowY: "scroll",
  width: "100%"
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
  style?: any;
} // should be static; change does NOT cause update.

export class IFrameHTML extends Component<PropTypes, {}> {
  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, ["reload", "font_size"]);
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
    const scroll = $(elt)
      .contents()
      .scrollTop();
    this.props.actions.save_editor_state(this.props.id, { scroll });
  }

  init_scroll_handler(): void {
    const node = ReactDOM.findDOMNode(this.refs.iframe);
    if (node !== undefined) {
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
    if (node !== undefined) {
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
    // param below is just to avoid caching.
    return (
      <iframe
        ref={"iframe"}
        src={`${window.app_base_url}/${this.props.project_id}/raw/${
          this.props.path
        }?param=${this.props.reload}`}
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
    if (is_safari) {
      $(ReactDOM.findDOMNode(this)).make_height_defined();
    }
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

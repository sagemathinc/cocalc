/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Component that shows rendered HTML in an iFrame, so safe and no mangling needed...
*/

// NOTE:
//
// The <iframe> tag is still in an ES6 component, because in Firefox
// the iframe document's content is empty when using the <iframe>
// tag in a functional component (it would be fine with chrome).
// Some day in the future this might no longer be necessary ... (react 16.13.1)

import * as $ from "jquery";
import { Set } from "immutable";
import { is_safari } from "../generic/browser";
import {
  change_filename_extension,
  is_different,
  list_alternatives,
} from "smc-util/misc";
import { throttle } from "underscore";
import { React, Component, ReactDOM, Rendered, CSS } from "../../app-framework";
import { use_font_size_scaling } from "../frame-tree/hooks";
import { EditorState } from "../frame-tree/types"

interface Props {
  id: string;
  actions: any;
  editor_state: EditorState;
  is_fullscreen: boolean;
  fullscreen_style?: any;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;
  mode: "rmd" | undefined;
  style?: any; // style should be static; change does NOT cause update.
  derived_file_types: Set<string>;
}

function should_memoize(prev, next) {
  return !is_different(prev, next, [
    "reload",
    "font_size",
    "derived_file_types",
  ]);
}

const with_font_size_scaling = (IFrameHTMLComponent) => {
  return React.memo((props: Props) => {
    const { font_size } = props;
    const scaling = use_font_size_scaling(font_size);
    return <IFrameHTMLComponent scaling={scaling} {...props} />;
  }, should_memoize);
};

const STYLE: CSS = {
  overflowY: "auto",
  width: "100%",
};

interface PropTypes extends Props {
  scaling: number;
}

class IFrameHTMLComponent extends Component<PropTypes, {}> {
  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "reload",
      "derived_file_types",
      "scaling",
      "font_size", // used for scaling, but also re-render on that
    ]);
  }

  componentWillReceiveProps(next): void {
    if (this.props.reload !== next.reload) {
      this.reload_iframe();
    }
    if (
      this.props.scaling !== next.scaling ||
      this.props.font_size !== next.font_size
    ) {
      this.set_iframe_style(next.scaling);
    }
  }

  componentDidMount(): void {
    this.safari_hack();
    this.set_iframe_style(this.props.scaling);
  }

  on_scroll(): void {
    const elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null) return;
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
          this.set_iframe_style(this.props.scaling);
          this.restore_scroll();
          this.init_scroll_handler();
          this.init_click_handler();
        }}
      />
    );
  }

  reload_iframe(): void {
    const elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null || elt.contentDocument == null) return;
    elt.style.opacity = 0;
    elt.contentDocument.location.reload(true);
  }

  set_iframe_style(scaling: number): void {
    const elt = ReactDOM.findDOMNode(this.refs.iframe);
    if (elt == null || elt.contentDocument == null) return;
    elt.style.opacity = 1;
    const body = elt.contentDocument.body;
    // don't use "zoom: ...", which is not a standard property
    // https://github.com/sagemathinc/cocalc/issues/4438
    body.style.transform = `scale(${scaling})`;
    body.style["transform-origin"] = "0 0";
    if (this.props.is_fullscreen && this.props.fullscreen_style != null) {
      body.style = { ...body.style, ...this.props.fullscreen_style };
    }
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

export const IFrameHTML = with_font_size_scaling(IFrameHTMLComponent);

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
import { delay } from "awaiting";
import { is_safari } from "../generic/browser";
import {
  change_filename_extension,
  is_different,
  list_alternatives,
} from "smc-util/misc";
import { debounce } from "lodash";
import { React, ReactDOM, Rendered, CSS } from "../../app-framework";
import { use_font_size_scaling } from "../frame-tree/hooks";
import { EditorState } from "../frame-tree/types";
import { join } from "path";

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
  tab_is_visible: boolean;
  mode: "rmd" | undefined;
  style?: any; // style should be static; change does NOT cause update.
  derived_file_types: Set<string>;
}

function should_memoize(prev, next) {
  return !is_different(prev, next, [
    "reload",
    "font_size", // used for scaling
    "derived_file_types",
    "tab_is_visible",
  ]);
}

const STYLE: CSS = {
  overflowY: "auto",
  width: "100%",
} as const;

export const IFrameHTML: React.FC<Props> = React.memo((props: Props) => {
  const {
    id,
    actions,
    editor_state,
    is_fullscreen,
    fullscreen_style,
    project_id,
    path,
    reload,
    font_size,
    mode,
    style,
    derived_file_types,
    tab_is_visible,
  } = props;

  const rootEl = React.useRef(null);
  const iframe = React.useRef(null);
  const mounted = React.useRef(false);
  const scaling = use_font_size_scaling(font_size);

  // once after mounting
  React.useEffect(function () {
    mounted.current = true;
    reload_iframe();
    safari_hack();
    set_iframe_style(scaling);
    return function () {
      mounted.current = false;
    };
  }, []);

  React.useEffect(
    function () {
      if (tab_is_visible) restore_scroll();
    },
    [tab_is_visible]
  );

  React.useEffect(
    function () {
      set_iframe_style(scaling);
    },
    [scaling]
  );

  function click_iframe(): void {
    actions.set_active_id(id);
  }

  function init_click_handler(): void {
    const node = ReactDOM.findDOMNode(iframe.current);
    if (node != null && node.contentDocument != null) {
      node.contentDocument.addEventListener("click", click_iframe);
    }
  }

  function on_scroll(): void {
    if (!mounted.current || !tab_is_visible) return;
    const elt = ReactDOM.findDOMNode(iframe.current);
    if (elt == null) return;
    const el = $(elt);
    const scroll = el.contents().scrollTop();
    // we filter out the case where display:none higher up in the DOM tree
    // causes the iframe to have zero height, despite being still visible.
    if (el.height() == 0) return;
    actions.save_editor_state(id, { scroll });
  }

  function init_scroll_handler(): void {
    const node = ReactDOM.findDOMNode(iframe.current);
    if (node != null && node.contentDocument != null) {
      node.contentDocument.addEventListener(
        "scroll",
        debounce(() => on_scroll(), 150)
      );
    }
  }

  function restore_scroll() {
    const scroll: number | undefined = editor_state.get("scroll");
    if (scroll == null) return;
    let elt = ReactDOM.findDOMNode(iframe.current);
    if (elt == null) return;
    elt = $(elt);
    elt.contents().scrollTop(scroll);
    elt.css("opacity", 1);
  }

  async function iframe_loaded() {
    await delay(0);
    set_iframe_style(scaling);
    restore_scroll();
    init_scroll_handler();
    init_click_handler();
  }

  function render_iframe() {
    let actual_path = path;
    if (mode == "rmd" && derived_file_types != undefined) {
      if (derived_file_types.contains("html")) {
        // keep path as it is; don't remove this case though because of the else
      } else if (derived_file_types.contains("nb.html")) {
        actual_path = change_filename_extension(path, "nb.html");
      } else {
        return render_no_html();
      }
    }

    // param below is just to avoid caching.
    const src = join(
      window.app_base_path,
      project_id,
      "raw",
      `${actual_path}?param=${reload}`
    );

    return (
      <iframe
        ref={iframe}
        src={src}
        width={"100%"}
        height={"100%"}
        style={{ border: 0, opacity: 0, ...style }}
        onLoad={iframe_loaded}
      />
    );
  }

  function reload_iframe(): void {
    const elt = ReactDOM.findDOMNode(iframe.current);
    if (elt == null || elt.contentDocument == null) return;
    elt.style.opacity = 0;
    elt.contentDocument.location.reload(true);
  }

  function set_iframe_style(scaling: number): void {
    const elt = ReactDOM.findDOMNode(iframe.current);
    if (elt == null || elt.contentDocument == null) return;
    elt.style.opacity = 1;
    const body = elt.contentDocument.body;
    if (body?.style == null) return;
    // don't use "zoom: ...", which is not a standard property
    // https://github.com/sagemathinc/cocalc/issues/4438
    body.style.transform = `scale(${scaling})`;
    body.style["transform-origin"] = "0 0";
    if (is_fullscreen && fullscreen_style != null) {
      body.style = { ...body.style, ...fullscreen_style };
    }
  }

  function safari_hack(): void {
    if (is_safari()) {
      $(ReactDOM.findDOMNode(rootEl.current)).make_height_defined();
    }
  }

  function render_no_html(): Rendered {
    return (
      <div>
        <p>There is no rendered HTML file available.</p>
        {derived_file_types.size > 0 ? (
          <p>
            Instead, you might want to switch to the{" "}
            {list_alternatives(derived_file_types)} view by selecting it via the
            dropdown selector in the button row above.
          </p>
        ) : (
          ""
        )}
      </div>
    );
  }

  // the cocalc-editor-div is needed for a safari hack only
  return (
    <div style={STYLE} className={"cocalc-editor-div smc-vfill"} ref={rootEl}>
      {render_iframe()}
    </div>
  );
}, should_memoize);

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

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
import { React, ReactDOM, Rendered, CSS } from "../../app-framework";
import { use_font_size_scaling } from "../frame-tree/hooks";

const STYLE: CSS = {
  overflowY: "auto",
  width: "100%",
};

interface Props {
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
  } = props;

  const root_div = React.useRef<HTMLDivElement>(null);
  const iframe_ref = React.useRef<HTMLIFrameElement>(null);

  const scaling = use_font_size_scaling(font_size);

  // once when mounted
  React.useEffect(() => {
    safari_hack();
  }, []);

  React.useEffect(() => {
    reload_iframe();
  }, [reload]);

  React.useEffect(() => {
    set_iframe_style();
  }, [font_size]);

  function on_scroll(): void {
    const elt = ReactDOM.findDOMNode(iframe_ref.current);
    if (elt == null) {
      return;
    }
    const scroll = $(elt).contents().scrollTop();
    actions.save_editor_state(id, { scroll });
  }

  function init_scroll_handler(): void {
    const node = ReactDOM.findDOMNode(iframe_ref.current);
    if (node != null && node.contentDocument != null) {
      node.contentDocument.addEventListener(
        "scroll",
        throttle(() => on_scroll(), 150)
      );
    }
  }

  function click_iframe(): void {
    actions.set_active_id(id);
  }

  function init_click_handler(): void {
    const node = ReactDOM.findDOMNode(iframe_ref.current);
    if (node != null && node.contentDocument != null) {
      node.contentDocument.addEventListener("click", () => click_iframe());
    }
  }

  function restore_scroll() {
    const scroll: number | undefined = editor_state.get("scroll");
    if (scroll === undefined) return;
    let elt = ReactDOM.findDOMNode(iframe_ref.current);
    if (elt == null) {
      return;
    }
    elt = $(elt);
    if (scroll != null) {
      elt.contents().scrollTop(scroll);
    }
    elt.css("opacity", 1);
  }

  function render_iframe() {
    let path_derived = path;
    if (mode == "rmd" && derived_file_types != undefined) {
      if (derived_file_types.contains("html")) {
        // keep path as it is; don't remove this case though because of the else
      } else if (derived_file_types.contains("nb.html")) {
        path_derived = change_filename_extension(path, "nb.html");
      } else {
        return render_no_html();
      }
    }

    // param below is just to avoid caching.
    const src_url = `${window.app_base_url}/${project_id}/raw/${path_derived}?param=${reload}`;

    return (
      <iframe
        ref={iframe_ref}
        src={src_url}
        width={"100%"}
        height={"100%"}
        style={{ border: 0, opacity: 0 }}
        onLoad={() => {
          set_iframe_style();
          restore_scroll();
          init_scroll_handler();
          init_click_handler();
        }}
      />
    );
  }

  function reload_iframe(): void {
    const elt = ReactDOM.findDOMNode(iframe_ref.current);
    if (elt == null) return;
    $(elt).css("opacity", 0);
    elt.contentDocument.location.reload(true);
  }

  function set_iframe_style(): void {
    const elt = ReactDOM.findDOMNode(iframe_ref.current);
    if (elt == null) return;
    const j = $(elt);
    j.css("opacity", 1);
    const body = j.contents().find("body");
    //body.css("transform", `scale(${scaling})`);
    //body.css("transform-origin", "0 0");
    if (is_fullscreen && fullscreen_style != null) {
      body.css(fullscreen_style);
    }
  }

  function safari_hack(): void {
    if (is_safari()) {
      $(ReactDOM.findDOMNode(root_div)).make_height_defined();
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
    <div
      ref={root_div}
      style={{ ...STYLE, ...style }}
      className={"cocalc-editor-div smc-vfill"}
    >
      {render_iframe()}
    </div>
  );
}, should_memoize);

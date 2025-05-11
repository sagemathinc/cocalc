/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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

import $ from "jquery";
import { Set } from "immutable";
import { delay } from "awaiting";
import {
  change_filename_extension,
  is_different,
  list_alternatives,
} from "@cocalc/util/misc";
import { debounce } from "lodash";
import { React, ReactDOM, Rendered, CSS } from "../../app-framework";
import { use_font_size_scaling } from "../frame-tree/hooks";
import { EditorState } from "../frame-tree/types";
import { useEffect, useRef, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Switch, Spin, Tooltip } from "antd";
import {
  set_local_storage,
  get_local_storage,
  delete_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
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
  value?: string;
}

function getKey({ project_id, path }) {
  return `${project_id}:${path}:trust`;
}
function isTrusted(props): boolean {
  return !!get_local_storage(getKey(props));
}
function setTrusted(props, trust: boolean) {
  if (trust) {
    set_local_storage(getKey(props), "true");
  } else {
    delete_local_storage(getKey(props));
  }
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
    value,
  } = props;

  // during init definitely nothing available to show users; this
  // is only needed for rmd mode where an aux file loaded from server.
  const [init, setInit] = useState<boolean>(mode == "rmd");
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [trust, setTrust0] = useState<boolean>(isTrusted(props));
  const setTrust = (trust) => {
    setTrusted(props, trust);
    setTrust0(trust);
  };

  useEffect(() => {
    if (mode != "rmd") {
      setInit(false);
      return;
    }
    let actual_path = path;
    if (mode == "rmd" && derived_file_types != undefined) {
      if (derived_file_types.contains("html")) {
        // keep path as it is; don't remove this case though because of the else
      } else if (derived_file_types.contains("nb.html")) {
        actual_path = change_filename_extension(path, "nb.html");
      } else {
        setSrcDoc(null);
      }
    }

    // read actual_path and set srcDoc to it.
    (async () => {
      let buf;
      try {
        buf = await webapp_client.project_client.readFile({
          project_id,
          path: actual_path,
        });
      } catch (err) {
        actions.set_error(`${err}`);
        return;
      } finally {
        // done -- we tried
        setInit(false);
      }
      let src = buf.toString("utf8");
      if (trust) {
        // extra security and pointed in the right direction.
        // We can't just use <iframe src= since the backend 'raw files' server
        // just always forces a download of that, for security reasons.
        const extraHead = `<base href="${join(appBasePath, project_id)}/files/">
        <meta http-equiv="Content-Security-Policy" content="default-src * data: blob: 'unsafe-inline' 'unsafe-eval';
  script-src * data: blob: 'unsafe-inline' 'unsafe-eval';
  img-src * data: blob:;
  style-src * data: blob: 'unsafe-inline';
  font-src * data: blob: about:;
  connect-src * data: blob:;
  frame-src * data: blob:;
  object-src * data: blob:;
  media-src * data: blob:;">`;
        const newSrc = src.replace(/<head>/i, `<head>${extraHead}`);
        if (src != newSrc) {
          src = newSrc;
        } else {
          src = `<head>\n${extraHead}\n</head>\n\n${src}`;
        }
      }
      setSrcDoc(src);
    })();
  }, [reload, mode, path, derived_file_types, trust]);

  const rootEl = useRef(null);
  const iframe = useRef(null);
  const mounted = useRef(false);
  const scaling = use_font_size_scaling(font_size);

  // once after mounting
  useEffect(function () {
    mounted.current = true;
    reload_iframe();
    set_iframe_style(scaling);
    return function () {
      mounted.current = false;
    };
  }, []);

  useEffect(
    function () {
      if (tab_is_visible) restore_scroll();
    },
    [tab_is_visible],
  );

  useEffect(
    function () {
      set_iframe_style(scaling);
    },
    [scaling],
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
        debounce(() => on_scroll(), 150),
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
    if (init) {
      // in the init phase.
      return (
        <div style={{ margin: "15px auto" }}>
          <Spin />
        </div>
      );
    }
    if (mode == "rmd" && srcDoc == null) {
      return render_no_html();
    }

    return (
      <iframe
        ref={iframe}
        srcDoc={mode != "rmd" ? value : (srcDoc ?? "")}
        width={"100%"}
        height={"100%"}
        style={{ border: 0, ...style }}
        onLoad={iframe_loaded}
        sandbox={
          !trust ? "allow-forms allow-scripts allow-presentation" : undefined
        }
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

  function render_no_html(): Rendered {
    return (
      <div>
        <p>There is no rendered HTML file available.</p>
        {(derived_file_types?.size ?? 0) > 0 ? (
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
      <div>
        <Tooltip
          title={
            "Arbitrary HTML is potentially dangerous.  If you trust this content, switch this to trusted."
          }
        >
          <Switch
            style={{ float: "right", marginTop: "5px", marginRight: "5px" }}
            checked={trust}
            onChange={(checked) => setTrust(checked)}
            unCheckedChildren={"Untrusted"}
            checkedChildren={"Trusted"}
          />
        </Tooltip>
      </div>
      {render_iframe()}
    </div>
  );
}, should_memoize);

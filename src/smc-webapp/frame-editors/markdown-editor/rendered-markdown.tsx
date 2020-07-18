/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Component that shows rendered markdown.
//
// It also:
//
//    - [x] tracks and restores scroll position
//    - [x] is scrollable
//    - [x] is zoomable
//    - [x] math is properly typeset
//    - [x] checkbox in markdown are interactive (can click them, which edits file)

import { Markdown } from "smc-webapp/r_misc";

import { is_different, path_split } from "smc-util/misc2";
import { throttle } from "underscore";
import { React, ReactDOM, CSS } from "../../app-framework";
import { use_font_size_scaling } from "../frame-tree/hooks";

const { process_checkboxes } = require("smc-webapp/tasks/desc-rendering");
const { apply_without_math } = require("smc-util/mathjax-utils-2");

import { MAX_WIDTH_NUM } from "../options";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value: string;
  editor_state: any;
  reload_images: boolean;
}

function should_memoize(prev, next): boolean {
  return !is_different(prev, next, [
    "id",
    "project_id",
    "path",
    "font_size",
    "read_only",
    "value",
    "reload_images",
  ]);
}

export const RenderedMarkdown: React.FC<Props> = React.memo((props: Props) => {
  const {
    actions,
    id,
    path,
    project_id,
    font_size,
    read_only,
    value,
    editor_state,
    reload_images,
  } = props;

  const scroll = React.useRef<HTMLDivElement>(null);

  const scaling = use_font_size_scaling(font_size);

  // once when mounted
  React.useEffect(() => {
    restore_scroll();
  }, []);

  function on_scroll(): void {
    const elt = ReactDOM.findDOMNode(scroll.current);
    if (elt == null) {
      return;
    }
    const scroll_val = $(elt).scrollTop();
    actions.save_editor_state(id, { scroll_val });
  }

  async function restore_scroll(): Promise<void> {
    const scroll_val = editor_state.get("scroll");
    const elt = $(ReactDOM.findDOMNode(scroll.current));
    if (elt.length === 0) return;
    elt.scrollTop(scroll_val);
    elt.find("img").on("load", function () {
      elt.scrollTop(scroll_val);
    });
  }

  function on_click(e): void {
    // same idea as in tasks/desc-rendered.cjsx
    if (read_only) {
      return;
    }
    if (!e.target) return;
    const data = e.target.dataset;
    if (!data || !data.checkbox) return;
    e.stopPropagation();
    actions.toggle_markdown_checkbox(
      id,
      parseInt(data.index),
      data.checkbox === "true"
    );
  }

  const value_md = apply_without_math(value, process_checkboxes);
  const style: CSS = {
    overflowY: "auto",
    width: "100%",
  };
  const style_inner: CSS = {
    ...{
      maxWidth: `${(1 + (scaling - 1) / 2) * MAX_WIDTH_NUM}px`,
      margin: "10px auto",
      padding: "0 10px",
    },
    ...{
      // transform: scale() and transformOrigin: "0 0" or "center 0"
      // doesn't work well. Changing the base font size is fine.
      fontSize: `${100 * scaling}%`,
    },
  };

  return (
    <div
      style={style}
      ref={scroll}
      onScroll={throttle(() => on_scroll(), 250)}
      onClick={(e) => on_click(e)}
      /* this cocalc-editor-div class is needed for a safari hack only */
      className={"cocalc-editor-div"}
    >
      <div style={style_inner}>
        <Markdown
          value={value_md}
          project_id={project_id}
          file_path={path_split(path).head}
          safeHTML={true}
          reload_images={reload_images}
          highlight_code={true}
        />
      </div>
    </div>
  );
}, should_memoize);

RenderedMarkdown.displayName = "MarkdownEditor-RenderedMarkdown";

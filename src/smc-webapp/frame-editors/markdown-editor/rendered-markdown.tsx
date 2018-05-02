/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Component that shows rendered markdown.

It also:

   - [ ] tracks and restores scroll position
   - [ ] is scrollable
   - [ ] is zoomable
   - [ ] math is properly typeset
   - [ ] checkbox in markdown are interactive (can click them, which edits file)
*/

import { is_different, path_split } from "../generic/misc";

const { throttle } = require("underscore");

const { Loading, Markdown } = require("smc-webapp/r_misc");

import { React, rclass, rtypes, /* Component, Rendered,*/ ReactDOM } from "../generic/react";

const { process_checkboxes } = require("smc-webapp/tasks/desc-rendering");
const { apply_without_math } = require("smc-util/mathjax-utils-2");

import { MAX_WIDTH } from "./options.ts";

export const RenderedMarkdown = rclass({
  displayName: "MarkdownEditor-RenderedMarkdown",

  propTypes: {
    actions: rtypes.object.isRequired,
    id: rtypes.string.isRequired,
    path: rtypes.string.isRequired,
    project_id: rtypes.string.isRequired,
    font_size: rtypes.number.isRequired,
    read_only: rtypes.bool,
    reload_images: rtypes.bool,
    value: rtypes.string,
    content: rtypes.string, // used instead of file if available (e.g., only used for public)
    editor_state: rtypes.immutable.Map
  }, // only used for initial render

  shouldComponentUpdate(next) {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size",
      "read_only",
      "value",
      "content",
      "reload_images"
    ]);
  },

  on_scroll() {
    const elt = ReactDOM.findDOMNode(this.refs.scroll);
    if (elt == null) {
      return;
    }
    const scroll = $(elt).scrollTop();
    return this.props.actions.save_editor_state(this.props.id, { scroll });
  },

  componentDidMount() {
    this.restore_scroll();
    setTimeout(this.restore_scroll, 200);
    return setTimeout(this.restore_scroll, 500);
  },

  componentDidUpdate() {
    return setTimeout(this.restore_scroll, 1);
  },

  restore_scroll() {
    const scroll =
      this.props.editor_state != null
        ? this.props.editor_state.get("scroll")
        : undefined;
    if (scroll != null) {
      const elt = ReactDOM.findDOMNode(this.refs.scroll);
      if (elt != null) {
        return $(elt).scrollTop(scroll);
      }
    }
  },

  on_click(e) {
    // same idea as in tasks/desc-rendered.cjsx
    if (this.props.read_only) {
      return;
    }
    const data = e.target != null ? e.target.dataset : undefined;
    if (data == null) {
      return;
    }
    if (data.checkbox != null) {
      e.stopPropagation();
      return this.props.actions.toggle_markdown_checkbox(
        this.props.id,
        parseInt(data.index),
        data.checkbox === "true"
      );
    }
  },

  render() {
    let value =
      this.props.content != null ? this.props.content : this.props.value;
    if (value == null) {
      return <Loading />;
    }
    value = apply_without_math(value, process_checkboxes);
    // the cocalc-editor-div is needed for a safari hack only
    return (
      <div
        style={{
          overflowY: "scroll",
          width: "100%",
          zoom: (this.props.font_size != null ? this.props.font_size : 16) / 16
        }}
        ref={"scroll"}
        onScroll={throttle(this.on_scroll, 250)}
        onClick={this.on_click}
        className={"cocalc-editor-div"}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "10px auto",
            padding: "0 10px"
          }}
        >
          <Markdown
            id={`frame-${this.props.id}`}
            value={value}
            project_id={this.props.project_id}
            file_path={path_split(this.props.path).head}
            safeHTML={true}
            reload_images={this.props.reload_images}
            highlight_code={true}
          />
        </div>
      </div>
    );
  }
});

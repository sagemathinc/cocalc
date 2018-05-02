/*
Component that shows rendered markdown.

It also:

   - [x] tracks and restores scroll position
   - [x] is scrollable
   - [x] is zoomable
   - [x] math is properly typeset
   - [x] checkbox in markdown are interactive (can click them, which edits file)
*/

import { is_different, path_split } from "../generic/misc";

const { throttle } = require("underscore");

const { Loading, Markdown } = require("smc-webapp/r_misc");

import { React, Component, Rendered, ReactDOM } from "../generic/react";

const { process_checkboxes } = require("smc-webapp/tasks/desc-rendering");
const { apply_without_math } = require("smc-util/mathjax-utils-2");

import { MAX_WIDTH } from "./options.ts";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value?: string;
  content?: string;
  editor_state: any;
  reload_images: boolean;
}

export class RenderedMarkdown extends Component<Props, {}> {
  static displayName = "MarkdownEditor-RenderedMarkdown";

  shouldComponentUpdate(next): boolean {
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
    // TODO: instead we should do this onLoad...
    for (let tm of [0, 50, 250, 500]) {
      setTimeout(() => this.restore_scroll(), tm);
    }
  }

  componentDidUpdate(): void {
    setTimeout(() => this.restore_scroll(), 1);
  }

  restore_scroll(): void {
    const scroll = this.props.editor_state.get("scroll");
    if (scroll != null) {
      $(ReactDOM.findDOMNode(this.refs.scroll)).scrollTop(scroll);
    }
  }

  on_click(e): void {
    // same idea as in tasks/desc-rendered.cjsx
    if (this.props.read_only) {
      return;
    }
    if (!e.target) return;
    const data = e.target.dataset;
    if (!data || !data.checkbox) return;
    e.stopPropagation();
    this.props.actions.toggle_markdown_checkbox(
      this.props.id,
      parseInt(data.index),
      data.checkbox === "true"
    );
  }

  render(): Rendered {
    let value: string | undefined =
      this.props.content != undefined ? this.props.content : this.props.value;
    if (!value) {
      return <Loading />;
    }
    value = apply_without_math(value, process_checkboxes);

    return (
      <div
        style={{
          overflowY: "scroll",
          width: "100%",
          zoom: (this.props.font_size != null ? this.props.font_size : 16) / 16
        }}
        ref={"scroll"}
        onScroll={throttle(() => this.on_scroll(), 250)}
        onClick={this.on_click}
        className={
          "cocalc-editor-div"
        } /* this cocalc-editor-div class is needed for a safari hack only */
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
}

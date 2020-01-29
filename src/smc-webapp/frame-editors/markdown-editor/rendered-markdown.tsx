/*
Component that shows rendered markdown.

It also:

   - [x] tracks and restores scroll position
   - [x] is scrollable
   - [x] is zoomable
   - [x] math is properly typeset
   - [x] checkbox in markdown are interactive (can click them, which edits file)
*/

import { Markdown } from "smc-webapp/r_misc";

import { is_different, path_split } from "smc-util/misc2";
import { throttle } from "underscore";
import { React, Component, Rendered, ReactDOM } from "../../app-framework";

const { process_checkboxes } = require("smc-webapp/tasks/desc-rendering");
const { apply_without_math } = require("smc-util/mathjax-utils-2");

import { MAX_WIDTH } from "./options";

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
    this.restore_scroll();
  }

  async restore_scroll(): Promise<void> {
    const scroll = this.props.editor_state.get("scroll");
    const elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    if (elt.length === 0) return;
    elt.scrollTop(scroll);
    elt.find("img").on("load", function() {
      elt.scrollTop(scroll);
    });
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
    const value = apply_without_math(this.props.value, process_checkboxes);
    return (
      <div
        style={{
          overflowY: "auto",
          width: "100%",
          zoom: (this.props.font_size != null ? this.props.font_size : 16) / 16
        }}
        ref={"scroll"}
        onScroll={throttle(() => this.on_scroll(), 250)}
        onClick={e => this.on_click(e)}
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

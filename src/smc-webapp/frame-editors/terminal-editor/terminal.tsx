/*
A single terminal frame.
*/

import { throttle } from "underscore";

import { is_different } from "../generic/misc";

import { React, Component, Rendered, ReactDOM } from "../../app-framework";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_state: any;
}

export class Terminal extends Component<Props, {}> {
  static displayName = "Terminal"

  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size"
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
  }

  render(): Rendered {
    return (
      <div
        style={{
          overflowY: "scroll",
          width: "100%"
        }}
        ref={"scroll"}
        onScroll={throttle(() => this.on_scroll(), 250)}
        className={
          "cocalc-editor-div"
        } /* this cocalc-editor-div class is needed for a safari hack only */
      >
        <div
          style={{
            margin: "10px auto",
            padding: "0 10px"
          }}
        >
          Terminal shit goes here.
        </div>
      </div>
    );
  }
}

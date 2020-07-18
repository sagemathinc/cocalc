/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Component that shows rendered HTML.
*/

import { delay } from "awaiting";
import { is_different, path_split } from "smc-util/misc2";
import { Map } from "immutable";
import { throttle } from "underscore";
import { React, Component, Rendered, ReactDOM } from "../../app-framework";
import { MAX_WIDTH } from "../options";
import { HTML } from "smc-webapp/r_misc";

interface PropTypes {
  id: string;
  actions: any;
  path: string;
  project_id: string;
  font_size: number;
  read_only: boolean;
  value?: string;
  content?: string; // used instead of file, if this is public.
  editor_state: Map<string, any>;
}

export class QuickHTMLPreview extends Component<PropTypes, {}> {
  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size",
      "read_only",
      "value",
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
    for (const wait of [0, 200, 500]) {
      this.restore_scroll(wait);
    }
  }

  async restore_scroll(wait?: number): Promise<void> {
    if (wait) {
      await delay(wait);
    }
    const scroll: number | undefined = this.props.editor_state.get("scroll");
    if (scroll !== undefined) {
      $(ReactDOM.findDOMNode(this.refs.scroll)).scrollTop(scroll);
    }
  }

  post_hook(elt) {
    //  make html even more sane for editing inside cocalc (not an iframe)
    elt.find("link").remove(); // gets rid of external CSS style
    elt.find("style").remove();
  } // gets rid of inline CSS style

  render(): Rendered {
    return (
      <div
        style={{
          overflowY: "auto",
          width: "100%",
          fontSize: `${this.props.font_size}px`,
        }}
        ref={"scroll"}
        onScroll={throttle(() => this.on_scroll(), 250)}
        className={"cocalc-editor-div"}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "10px auto",
            padding: "0 10px",
          }}
        >
          <HTML
            value={this.props.value}
            project_id={this.props.project_id}
            file_path={path_split(this.props.path).head}
            safeHTML={true}
            post_hook={this.post_hook}
          />
        </div>
      </div>
    );
  }
}

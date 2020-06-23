/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is a renderer using the embed tag, so works with browsers that have a PDF viewer plugin.
*/

import { raw_url } from "../frame-tree/util";

import { Component, React, Rendered } from "../../app-framework";

export interface Props {
  actions: any;
  id: string;
  project_id: string;
  is_current: boolean;
  path: string;
  reload?: number;
}

export class PDFEmbed extends Component<Props, {}> {
  render_embed(): Rendered {
    const src: string = `${raw_url(
      this.props.project_id,
      this.props.path
    )}?param=${this.props.reload}`;
    return (
      <embed
        ref={"embed"}
        width={"100%"}
        height={"100%"}
        src={src}
        type={"application/pdf"}
      />
    );
  }

  focus(): void {
    this.props.actions.set_active_id(this.props.id);
    $(this.refs.embed).focus();
  }

  render_clickable(): Rendered {
    return (
      <>
        <div
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            zIndex: this.props.is_current ? -1 : 1,
          }}
          onMouseEnter={() => this.focus()}
        />
        {this.render_embed()}
      </>
    );
  }

  render() {
    return (
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
        }}
      >
        {this.render_clickable()}
      </div>
    );
  }
}

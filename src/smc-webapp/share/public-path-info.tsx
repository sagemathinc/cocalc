/*
Display information about a public path.
*/

import { Map } from "immutable";

import { Rendered, React, Component } from "../app-framework";

import { Space } from "../r_misc/space";
const { r_join } = require("../r_misc");

//import { Markdown } from "../r_misc/markdown";
const { Markdown } = require("../r_misc");

import { path_split } from "smc-util/misc";

interface Props {
  info?: Map<string, any>;
  path: string;
  isdir?: boolean;
}

export class PublicPathInfo extends Component<Props> {
  private render_external_links(): Rendered {
    if (this.props.isdir) return;
    let href = path_split(this.props.path).tail;
    if (href.length === 0) {
      href = ".";
    }

    const v: Rendered[] = [];
    for (let type of ["Download", "Raw", "Embed"]) {
      v.push(
        <a
          key={type}
          href={href + `?viewer=${type.toLowerCase()}`}
          style={{ textDecoration: "none" }}
        >
          {type}
        </a>
      );
    }

    return (
      <div className="pull-right" style={{ marginRight: "5px" }}>
        {r_join(v, <Space />)}
      </div>
    );
  }

  private render_desc(): Rendered {
    if (this.props.info == null) return;
    let desc = this.props.info.get("description");
    if (!desc) return;
    desc = desc[0].toUpperCase() + desc.slice(1);
    console.log("render_desc", desc, this.props.info.toJS());
    return (
      <Markdown style={{ color: "#444", marginLeft: "30px" }} value={desc} />
    );
  }

  public render(): Rendered {
    return (
      <div style={{ background: "#ddd" }}>
        {this.render_external_links()}
        {this.render_desc()}
      </div>
    );
  }
}

/*
Display information about a public path.
*/

import { Map } from "immutable";

import { Rendered, React, Component } from "../app-framework";

import { Space } from "../r_misc/space";

//import { Markdown } from "../r_misc/markdown";
const { Markdown } = require('../r_misc');

import { path_split, filename_extension } from "smc-util/misc";

interface Props {
  info?: Map<string, any>;
  path: string;
}

export class PublicPathInfo extends Component<Props> {
  private render_external_links(): Rendered {
    let href = path_split(this.props.path).tail;
    if (href.length === 0) {
      href = ".";
    }

    // follow raw links only in a few special cases (not html!)
    const ext: string = filename_extension(this.props.path).toLowerCase();
    const raw_rel = ext === "pdf" || ext === "md" ? undefined : "nofollow";

    return (
      <div className="pull-right" style={{ marginRight: "5px" }}>
        <a
          href={href + "?viewer=raw"}
          target="_blank"
          rel={raw_rel}
          style={{ textDecoration: "none" }}
        >
          Raw
        </a>
        <Space />
        <Space />
        <a
          href={href + "?viewer=embed"}
          target="_blank"
          rel="nofollow"
          style={{ textDecoration: "none" }}
        >
          Embed
        </a>
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

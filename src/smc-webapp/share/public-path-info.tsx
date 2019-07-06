/*
Display information about a public path.
*/

import { Map } from "immutable";

import { Rendered, React, Component } from "../app-framework";

import { Space } from "../r_misc/space";
const { r_join } = require("../r_misc");

import { path_split } from "smc-util/misc";

import { LICENSES } from "./config/licenses";

import { Author } from "./types";

import { AuthorLink } from "./author-link";

interface Props {
  info?: Map<string, any>;
  path: string;
  isdir?: boolean;
  authors: Author[];
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
      <div className="pull-right" style={{ marginRight: "5px" }} key={"links"}>
        {r_join(v, <Space />)}
      </div>
    );
  }

  private render_desc(): Rendered {
    if (this.props.info == null) return;
    let desc = this.props.info.get("description");
    if (!desc) return;
    return <div key={"desc"}>{desc}</div>;
  }

  private render_license(): Rendered {
    if (this.props.info == null) return;
    const license = this.props.info.get("license", "");
    if (license == "") return;
    let desc: string | undefined = LICENSES[license];
    // fallback in case of weird license not listed in our table:
    if (desc == undefined) desc = license;
    return <div key={"license"}>{desc}</div>;
  }

  private render_authors(): Rendered {
    const v: Rendered[] = [];
    for (let author of this.props.authors) {
      v.push(
        <AuthorLink
          key={author.account_id}
          name={author.name}
          account_id={author.account_id}
        />
      );
    }
    return <div key={"authors"}>{r_join(v, <Space />)}</div>;
  }

  public render(): Rendered {
    return (
      <div style={{ background: "#efefef", paddingLeft: "5px" }}>
        {this.render_external_links()}
        {this.render_desc()}
        {this.render_license()}
        {this.render_authors()}
      </div>
    );
  }
}

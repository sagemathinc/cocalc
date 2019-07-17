/*
Display information about a public path.
*/

import { Map } from "immutable";

import { Rendered, React, Component } from "../app-framework";

import { r_join } from "../r_misc/r_join";

import { path_split, plural } from "smc-util/misc";

import { LICENSES } from "./config/licenses";

import { Author } from "./types";

import { AuthorLink } from "./author-link";

const MAX_AUTHORS = 10;

interface Props {
  info?: Map<string, any>;
  path: string;
  isdir?: boolean;
  authors?: Author[];
  base_url: string;
  views?: number;
}

function Field(props: { name: string }) {
  return <b style={{ color: "#666" }}>{props.name}: </b>;
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
        {r_join(v)}
      </div>
    );
  }

  private render_desc(): Rendered {
    if (this.props.info == null) return;
    let desc = this.props.info.get("description");
    if (!desc) return;
    return (
      <div key={"desc"}>
        <Field name="Description" />{desc}
      </div>
    );
  }

  private render_license(): Rendered {
    if (this.props.info == null) return;
    const license = this.props.info.get("license", "");
    if (license == "") return;
    let desc: string | undefined = LICENSES[license];
    // fallback in case of weird license not listed in our table:
    if (desc == undefined) desc = license;
    return <div key={"license"}><Field name="License"/>{desc}</div>;
  }

  private render_authors(): Rendered {
    if (this.props.authors == null || this.props.authors.length == 0) return;
    const v: Rendered[] = [];
    for (let author of this.props.authors) {
      v.push(
        <AuthorLink
          key={author.account_id}
          name={author.name}
          account_id={author.account_id}
          base_url={this.props.base_url}
        />
      );
      if (v.length >= MAX_AUTHORS) {
        const n = this.props.authors.length - MAX_AUTHORS;
        if (n > 0) {
          v.push(
            <span>
              and {n} more {plural(n, "author")}...
            </span>
          );
          break;
        }
      }
    }
    return (
      <div key={"authors"}>
        <Field name={plural(v.length, "Author")} />{r_join(v)}
      </div>
    );
  }

  private render_views(): Rendered {
    if (this.props.views == null || this.props.views == 0) return;
    return (
      <div key="views">
        <Field name={'Views ' + (this.props.isdir ? "of something in this directory" : "")}/>
        {this.props.views}
      </div>
    );
  }

  public render(): Rendered {
    return (
      <div style={{ background: "#efefef", paddingLeft: "5px" }}>
        {this.render_external_links()}
        {this.render_authors()}
        {this.render_views()}
        {this.render_license()}
        {this.render_desc()}
      </div>
    );
  }
}

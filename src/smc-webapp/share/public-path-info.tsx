/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Display information about a public path.
*/

import { Map } from "immutable";
import { Rendered, React, Component } from "../app-framework";
import { r_join } from "../r_misc/r_join";
import { path_split, plural } from "smc-util/misc";
import {
  COMPUTE_IMAGES,
  FALLBACK_COMPUTE_IMAGE,
} from "smc-util/compute-images";
import { compute_image2name, CUSTOM_IMG_PREFIX } from "../custom-software/util";
import { LICENSES } from "./config/licenses";
import { Author } from "./types";
import { AuthorLink } from "./author-link";

const MAX_AUTHORS = 10;

interface Props {
  info?: Map<string, any>;
  path: string;
  isdir?: boolean;
  authors?: Author[];
  base_path: string;
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
    for (const type of ["Download", "Raw", "Embed"]) {
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
    const desc = this.props.info.get("description");
    if (!desc) return;
    return (
      <div key={"desc"}>
        <Field name="Description" />
        {desc}
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
    return (
      <div key={"license"}>
        <Field name="License" />
        {desc}
      </div>
    );
  }

  private render_authors(): Rendered {
    if (this.props.authors == null || this.props.authors.length == 0) return;
    const v: Rendered[] = [];
    for (const author of this.props.authors) {
      v.push(
        <AuthorLink
          key={author.account_id}
          name={author.name}
          account_id={author.account_id}
          base_path={this.props.base_path}
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
      <div key={"authors"} cocalc-test={"public-authors"}>
        <Field name={plural(v.length, "Author")} />
        {r_join(v)}
      </div>
    );
  }

  private render_views(): Rendered {
    if (this.props.views == null || this.props.views == 0) return;
    return (
      <div key="views" cocalc-test={"public-directory"}>
        <Field
          name={
            "Views " +
            (this.props.isdir ? "of something in this directory" : "")
          }
        />
        {this.props.views}
      </div>
    );
  }

  private render_compute_image(): Rendered {
    if (this.props.info == null) return;
    // the fallback will always be "default" for Ubuntu 18.04!
    const ci = this.props.info.get("compute_image") ?? FALLBACK_COMPUTE_IMAGE;
    // TODO handle custom image display names
    const title = ci.startsWith(CUSTOM_IMG_PREFIX)
      ? compute_image2name(ci)
      : COMPUTE_IMAGES[ci] != null
      ? COMPUTE_IMAGES[ci].title
      : ci;
    return (
      <div key="compute_image" cocalc-test={"compute-image"}>
        <Field name={"Compute Environment"} />
        {title}
      </div>
    );
  }

  public render(): Rendered {
    return (
      <div style={{ background: "#efefef", padding: "5px" }}>
        {this.render_external_links()}
        {this.render_authors()}
        {this.render_views()}
        {this.render_license()}
        {this.render_desc()}
        {this.render_compute_image()}
      </div>
    );
  }
}

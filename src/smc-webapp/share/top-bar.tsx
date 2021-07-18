/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "../app-framework";
import { CoCalcLogo } from "./cocalc-logo";
import { IsPublicFunction } from "./types";
import { r_join } from "../r_misc/r_join";
import { SiteSearch } from "./search";
import { Settings } from "smc-hub/share/settings";

interface TopBarProps {
  viewer?: string;
  path: string; // The share url. Must have a leading `/`. {base_path}/share{path}
  project_id?: string;
  base_path: string;
  site_name?: string;
  is_public: IsPublicFunction;
  launch_path?: string;
  settings: Settings;
}

export class TopBar extends Component<TopBarProps> {
  private render_logo(top: string): Rendered {
    return (
      <span style={{ marginRight: "10px" }}>
        <a href={top} style={{ textDecoration: "none" }}>
          <CoCalcLogo base_path={this.props.base_path} />{" "}
          {this.props.settings.site_name} Public Files
        </a>
      </span>
    );
  }

  private render_search(): Rendered {
    if (this.props.project_id != null) return;
    return (
      <div style={{ position: "absolute", top: 0, right: 0, width: "30%" }}>
        <SiteSearch />
      </div>
    );
  }

  public render(): Rendered {
    // TODO: break up this long function!
    const { viewer, path, launch_path, project_id, is_public } = this.props;
    let path_component: Rendered | Rendered[], top: string;
    let project_link: Rendered = undefined;
    if (path === "/") {
      top = ".";
      path_component = <span />;
    } else {
      let i;
      let v = path.split("/").slice(2);
      top = v.map(() => "..").join("/");
      if (v.length > 0 && v[v.length - 1] === "") {
        v = v.slice(0, v.length - 1);
      }
      const segments: Rendered[] = [];
      let t = "";

      v.reverse();
      for (i = 0; i < v.length; i++) {
        const val = v[i];
        const segment_path = v.slice(i).reverse().join("/");
        if (t && (!project_id || is_public(project_id, segment_path))) {
          const href = `${t}?viewer=share`;
          segments.push(
            <a key={t} href={href}>
              {val}
            </a>
          );
        } else {
          segments.push(<span key={t}>{val}</span>);
        }
        if (!t) {
          if (path.slice(-1) === "/") {
            t = "..";
          } else {
            t = ".";
          }
        } else {
          t += "/..";
        }
      }
      segments.reverse();
      path_component = r_join(
        segments,
        <span style={{ margin: "0 5px" }}> / </span>
      );

      if (project_id) {
        // We put in anonymous=true so that an anonymous account will get created if the
        // user is not already signed in (they usually are if they have an account, so this
        // should cause minimal confusion and friction, but might cause some -- we have to balance
        // friction from asking questions -- which kills like 80% of users -- with friction
        // for existing users).  Also note that path has the leading slash so that's why
        // it isn't "share/" below.
        const cocalc_url = `${top}/../app?anonymous=true&launch=share${
          launch_path ? launch_path : path
        }`;
        project_link = (
          <a
            target="_blank"
            href={cocalc_url}
            className="btn btn-success"
            rel="nofollow"
            style={{ marginLeft: "30px", fontSize: "14pt", maxWidth: "400px" }}
          >
            Open with one click!
          </a>
        );
      }
    }
    if (viewer === "embed") {
      return project_link;
    }

    return (
      <div
        key="top"
        style={{
          padding: "5px 5px 0px 5px",
          background: "#efefef",
        }}
      >
        {this.render_logo(top)}
        {this.render_search()}
        <span
          style={{
            paddingLeft: "15px",
            borderLeft: "1px solid black",
            marginLeft: "15px",
          }}
        >
          {path_component}
        </span>
        {project_link}
      </div>
    );
  }
}

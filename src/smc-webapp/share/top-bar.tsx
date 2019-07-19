import { React, Component, Rendered } from "../app-framework";
import { CoCalcLogo } from "./cocalc-logo";
import { IsPublicFunction } from "./types";
import { SITE_NAME } from "smc-util/theme";
import { r_join } from "../r_misc/r_join";
import { SiteSearch } from "./search";

interface TopBarProps {
  viewer?: string;
  path: string; // The share url. Must have a leading `/`. {base_url}/share{path}
  project_id?: string;
  base_url: string;
  site_name?: string;
  is_public: IsPublicFunction;
}

export class TopBar extends Component<TopBarProps> {
  static defaultProps = {
    site_name: SITE_NAME
  };

  private render_logo(top: string): Rendered {
    return (
      <span style={{ marginRight: "10px" }}>
        <a href={top} style={{ textDecoration: "none" }}>
          <CoCalcLogo base_url={this.props.base_url} /> Shared
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
    const { viewer, path, project_id, site_name, is_public } = this.props;
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
        const segment_path = v
          .slice(i)
          .reverse()
          .join("/");
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
        i = path.slice(1).indexOf("/");
        const proj_url = `${top}/../projects/${project_id}/files/${path.slice(
          2 + i
        )}?session=share`;
        project_link = (
          <a
            target="_blank"
            href={proj_url}
            className="pull-right"
            rel="nofollow"
            style={{ textDecoration: "none" }}
          >
            Open in {site_name}
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
          background: "#efefef"
        }}
      >
        {this.render_logo(top)}
        {this.render_search()}
        <span
          style={{
            paddingLeft: "15px",
            borderLeft: "1px solid black",
            marginLeft: "15px"
          }}
        >
          {path_component}
        </span>
        {project_link}
      </div>
    );
  }
}

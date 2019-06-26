/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
/*
Share server top-level landing page.
*/

import { React, Component, Rendered } from "../app-framework";

import { SITE_NAME, BASE_URL, DNS } from "smc-util/theme";

//import { r_join } from "../r_misc";
const { r_join } = require("../r_misc");

const CDN_LINKS = [
  {
    href:
      "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css",
    integrity:
      "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
  },
  // codemirror CDN -- https://cdnjs.com/libraries/codemirror
  {
    href:
      "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.40.2/codemirror.min.css",
    integrity: "sha256-I8NyGs4wjbMuBSUE40o55W6k6P7tu/7G28/JGUUYCIs="
  },
  {
    href: "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.10.2/katex.min.css",
    integrity: "sha256-uT5rNa8r/qorzlARiO7fTBE7EWQiX/umLlXsq7zyQP8="
  }
];

export type IsPublicFunction = (project_id: string, path: string) => boolean;

interface PageProps {
  site_name?: string;
  base_url: string;
  path: string; // the path with no base url to the currently displayed file, directory, etc.
  viewer: string; // 'share' or 'embed'
  project_id?: string; // only defined if we are viewing something in a project
  subtitle?: string;
  google_analytics?: string; // optional, and if set just the token
  notranslate?: boolean;
  is_public: IsPublicFunction;
}

export class Page extends Component<PageProps> {
  static defaultProps = {
    base_url: BASE_URL,
    site_name: SITE_NAME
  };

  private render_viewport(): Rendered {
    return (
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    );
  }

  private render_title(): Rendered {
    let title = "Shared";
    if (this.props.subtitle) {
      title += ` - ${this.props.subtitle}`;
    }
    return <title>{title}</title>;
  }

  private render_cocalc_link(): Rendered {
    if (this.props.viewer === "embed") {
      return (
        <div
          style={{
            right: 0,
            position: "absolute",
            fontSize: "8pt",
            border: "1px solid #aaa",
            padding: "2px"
          }}
        >
          <a href={"https://cocalc.com"} target={"_blank"} rel={"noopener"}>
            Powered by CoCalc
          </a>
        </div>
      );
    } else {
      return (
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translate(-50%)",
            fontSize: "12pt",
            maxHeight: "68px",
            overflowY: "hidden",
            background: "white",
            padding: "0 5px",
            border: "1px solid #aaa"
          }}
        >
          <a
            href={"https://cocalc.com/doc/features.html"}
            target={"_blank"}
            rel={"noopener"}
          >
            CoCalc
          </a>
        </div>
      );
    }
  }

  private render_notranslate(): Rendered {
    // don't translate the index pages
    if (!this.props.notranslate) {
      return;
    }
    return <meta name="google" content="notranslate" />;
  }

  private render_noindex(): Rendered {
    if (this.props.viewer === "share") {
      // we want share to be indexed
      return;
    }
  }

  private render_css(): Rendered {
    const css = `${this.props.base_url}/share/share.css`;
    return <link rel="stylesheet" href={css} />;
  }

  private render_favicon(): Rendered {
    const favicon = `${this.props.base_url}/share/favicon-32x32.png`;
    return <link rel="shortcut icon" href={favicon} type="image/png" />;
  }

  private render_google_analytics(): Rendered[] | undefined {
    if (!this.props.google_analytics) {
      return;
    }
    const ga = `\
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${this.props.google_analytics}');\
`;
    return [
      <script
        key={0}
        async={true}
        src={`https://www.googletagmanager.com/gtag/js?id=${
          this.props.google_analytics
        }`}
      />,
      <script key={1} dangerouslySetInnerHTML={{ __html: ga }} />
    ];
  }

  render_cocalc_analytics(): Rendered {
    return <script async={true} src={`https://${DNS}/analytics.js`} />;
  }

  private render_cdn_links(): Rendered[] {
    const v: Rendered[] = [];
    for (let x of CDN_LINKS) {
      v.push(
        <link
          rel="stylesheet"
          href={x.href}
          integrity={x.integrity}
          crossOrigin="anonymous"
        />
      );
    }
    return v;
  }

  public render(): Rendered {
    if (this.props.site_name == null) throw Error("bug -- site_name is null"); // make typescript happy.
    if (this.props.base_url == null) throw Error("bug -- base_url is null"); // make typescript happy.
    return (
      <html lang="en">
        <head>
          {this.render_viewport()}
          {this.render_title()}
          {this.render_cocalc_link()}
          {this.render_notranslate()}
          {this.render_cdn_links()}
          {this.render_favicon()}
          {this.render_css()}
          {this.render_noindex()}
          {this.render_google_analytics()}
          {this.render_cocalc_analytics()}
        </head>
        <body>
          <TopBar
            viewer={this.props.viewer}
            path={this.props.path}
            project_id={this.props.project_id}
            base_url={this.props.base_url}
            site_name={this.props.site_name}
            is_public={this.props.is_public}
          />
          {this.props.children}
        </body>
      </html>
    );
  }
}

class CoCalcLogo extends Component<{ base_url: string }> {
  public render(): Rendered {
    return (
      <img
        style={{ height: "21px", width: "21px" }}
        src={`${this.props.base_url}/share/cocalc-icon.svg`}
      />
    );
  }
}

interface TopBarProps {
  viewer?: string;
  path: string; // The share url. Must have a leading `/`. {base_url}/share{path}
  project_id?: string;
  base_url: string;
  site_name: string;
  is_public: IsPublicFunction;
}

class TopBar extends Component<TopBarProps> {
  public render(): Rendered {
    // TODO: break up this long function!
    const {
      viewer,
      path,
      project_id,
      base_url,
      site_name,
      is_public
    } = this.props;
    let path_component, top;
    if (viewer === "embed") {
      return <span />;
    }
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

    return (
      <div
        key="top"
        style={{
          padding: "5px 5px 0px 5px",
          height: "50px",
          background: "#dfdfdf"
        }}
      >
        <span style={{ marginRight: "10px" }}>
          <a href={top} style={{ textDecoration: "none" }}>
            <CoCalcLogo base_url={base_url} /> Shared
          </a>
        </span>
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

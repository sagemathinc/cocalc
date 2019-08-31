/*
Share server wrapper page -- any page the share server generates with a custom
share-server look is a child of this.
*/

import { React, Component, Rendered } from "../app-framework";
import { DNS } from "smc-util/theme";

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
    href: "https://cdn.jsdelivr.net/npm/katex@0.11.0/dist/katex.min.css",
    integrity: "sha384-BdGj8xC2eZkQaxoQ8nSLefg4AV4/AwB3Fj+8SUSo7pnKP6Eoy18liIKTPn9oBYNG"
  }
];

export type IsPublicFunction = (project_id: string, path: string) => boolean;

interface BasePageProps {
  base_url: string;
  subtitle?: string;
  viewer: "share" | "embed";
  google_analytics?: string; // optional, and if set just the token
  notranslate?: boolean;
  noindex: boolean; // if true, then search engines should not show this page in search results.
  description?: string;
}

export class BasePage extends Component<BasePageProps> {
  private render_viewport(): Rendered {
    return (
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    );
  }

  private render_title(): Rendered {
    let title = "CoCalc";
    if (this.props.subtitle) {
      title = `${this.props.subtitle} - CoCalc`;
    }
    return <title>{title}</title>;
  }

  private render_description_meta(): Rendered {
    if (!this.props.description) return;
    return <meta name="description" content={this.props.description} />;
  }

  private render_notranslate(): Rendered {
    // don't translate the index pages
    if (!this.props.notranslate) {
      return;
    }
    return <meta name="google" content="notranslate" />;
  }

  private render_noindex(): Rendered {
    if (this.props.noindex) {
      return <meta name="robots" content="noindex" />;
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
        defer={true}
        src={`https://www.googletagmanager.com/gtag/js?id=${
          this.props.google_analytics
        }`}
      />,
      <script key={1} dangerouslySetInnerHTML={{ __html: ga }} />
    ];
  }

  render_cocalc_analytics(): Rendered {
    return (
      <script async={true} defer={true} src={`https://${DNS}/analytics.js`} />
    );
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
    return (
      <html lang="en" style={{ height: "100%" }}>
        <head>
          {this.render_viewport()}
          {this.render_title()}
          {this.render_description_meta()}
          {this.render_notranslate()}
          {this.render_cdn_links()}
          {this.render_favicon()}
          {this.render_css()}
          {this.render_noindex()}
          {this.render_google_analytics()}
          {this.render_cocalc_analytics()}
        </head>
        <body
          style={{ height: "100%", display: "flex", flexDirection: "column" }}
        >
          {this.props.children}
        </body>
      </html>
    );
  }
}

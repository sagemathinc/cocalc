/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Share server wrapper page -- any page the share server generates with a custom
share-server look is a child of this.
*/

import { join } from "path";
import { React, Component, Rendered } from "../app-framework";
import { Settings } from "smc-hub/share/settings";
import { resource_links } from "smc-webapp/misc/resource-links";

export type IsPublicFunction = (project_id: string, path: string) => boolean;

interface BasePageProps {
  base_path: string;
  subtitle?: string;
  viewer: "share" | "embed";
  settings: Settings;
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
    const site_name = this.props.settings.site_name;
    const title = this.props.subtitle
      ? `${this.props.subtitle} - ${site_name}`
      : site_name;
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
    const css = join(this.props.base_path, "share/share.css");
    return <link rel="stylesheet" href={css} />;
  }

  private render_favicon(): Rendered {
    const favicon = join(this.props.base_path, "share/favicon-32x32.png");
    return <link rel="shortcut icon" href={favicon} type="image/png" />;
  }

  private render_google_analytics(): Rendered[] | undefined {
    if (!this.props.settings.google_analytics) {
      return;
    }
    const ga = `\
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${this.props.settings.google_analytics}');\
`;
    return [
      <script
        key={0}
        async={true}
        defer={true}
        src={`https://www.googletagmanager.com/gtag/js?id=${this.props.settings.google_analytics}`}
      />,
      <script key={1} dangerouslySetInnerHTML={{ __html: ga }} />,
    ];
  }

  render_cocalc_analytics(): Rendered {
    return (
      <script
        async={true}
        defer={true}
        src={`https://${this.props.settings.dns}/analytics.js`}
      />
    );
  }

  private render_resource_links(): Rendered[] {
    const prefix = `https://${join(
      this.props.settings.dns,
      this.props.base_path
    )}`;
    return resource_links(prefix, true).map((link, key) => (
      <link key={key} {...link} />
    ));
  }

  public render(): Rendered {
    return (
      <html lang="en" style={{ height: "100%" }}>
        <head>
          {this.render_viewport()}
          {this.render_title()}
          {this.render_description_meta()}
          {this.render_notranslate()}
          {this.render_resource_links()}
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

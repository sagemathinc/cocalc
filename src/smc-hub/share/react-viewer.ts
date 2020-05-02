/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { ContentPage } from "smc-webapp/share/content-page";
import { IsPublicFunction } from "smc-webapp/share/types";
import * as react_support from "smc-webapp/share/server-render";

// read token from disk, if it is there.
import { google_analytics_token } from "./util";
const google_analytics: string | undefined = google_analytics_token();

export function react_viewer(
  base_url: string,
  path: string,
  project_id: string | undefined,
  notranslate: boolean,
  viewer: "share" | "embed",
  is_public: IsPublicFunction,
  description?: string,
  launch_path?: string
): Function {
  return function (res, component, subtitle: string, noindex: boolean): void {
    const the_page = React.createElement(
      ContentPage,
      {
        base_url,
        path,
        project_id,
        subtitle,
        description,
        notranslate,
        google_analytics,
        viewer,
        is_public,
        noindex,
        launch_path,
      },
      component
    );
    const extra = { path, project_id }; // just used for log
    react_support.render(res, the_page, extra);
  };
}

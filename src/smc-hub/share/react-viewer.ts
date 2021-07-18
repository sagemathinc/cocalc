/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { ContentPage } from "smc-webapp/share/content-page";
import { IsPublicFunction } from "smc-webapp/share/types";
import * as react_support from "smc-webapp/share/server-render";
import { Settings } from "./settings";
import base_path from "smc-util-node/base-path";

export function react_viewer(
  path: string,
  project_id: string | undefined,
  notranslate: boolean,
  viewer: "share" | "embed",
  is_public: IsPublicFunction,
  settings: Settings,
  description?: string,
  launch_path?: string,
): Function {
  return function (res, component, subtitle: string, noindex: boolean): void {
    const the_page = React.createElement(
      ContentPage,
      {
        base_path,
        path,
        project_id,
        subtitle,
        description,
        notranslate,
        settings,
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

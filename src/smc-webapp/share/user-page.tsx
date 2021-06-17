/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Renders a page that describes a user and links to some
of the things they've publicly shared.
*/

import { Component, Rendered, React } from "../app-framework";
import { CoCalcLogo } from "./cocalc-logo";
import { CoCalcLink } from "./cocalc-link";
import { BasePage } from "./base-page";
import { PublicPathsBrowser } from "./public-paths-browser";
import { Settings } from "smc-hub/share/settings";

interface Props {
  account_id: string;
  name: string;
  base_path: string;
  settings: Settings;
  public_paths: any; //Map<string, any>;
  paths_order: any; // List<string>;
}

export class UserPage extends Component<Props> {
  private render_shares(): Rendered {
    return (
      <PublicPathsBrowser
        paths_order={this.props.paths_order}
        public_paths={this.props.public_paths}
        page_number={1}
        page_size={100000}
        path_prefix={"../"}
      />
    );
  }

  public render(): Rendered {
    // The page for a user makes no sense to index NOW, since it is a long listing,
    // and would throw off things, for now, hence the noindex below.
    return (
      <div style={{ margin: "30px" }}>
        <BasePage
          base_path={this.props.base_path}
          settings={this.props.settings}
          notranslate={true}
          noindex={true}
          viewer={"share"}
        >
          <div style={{ position: "absolute", top: "5px" }}>
            <a href="../">
              <CoCalcLogo base_path={this.props.base_path} /> Shared
            </a>
          </div>
          <CoCalcLink
            base_path={this.props.base_path}
            viewer="embed"
            settings={this.props.settings}
          />
          <div style={{ fontSize: "26px", fontWeight: 600 }}>
            {this.props.name}
          </div>
          {this.props.name} is a collaborator on projects that contain the
          following public CoCalc documents:
          {this.render_shares()}
        </BasePage>
      </div>
    );
  }
}

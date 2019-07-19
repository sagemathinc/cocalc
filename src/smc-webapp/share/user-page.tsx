/*
Renders a page that describes a user and links to some
of the things they've publicly shared.
*/

// import { Map, List} from "immutable";
import { Component, Rendered, React } from "../app-framework";

import { CoCalcLogo } from "./cocalc-logo";
import { CoCalcLink } from "./cocalc-link";
import { BasePage } from "./base-page";

import { PublicPathsBrowser } from "./public-paths-browser";

interface Props {
  account_id: string;
  name: string;
  base_url: string;
  google_analytics?: string;
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
          base_url={this.props.base_url}
          google_analytics={this.props.google_analytics}
          notranslate={true}
          noindex={true}
          viewer={"share"}
        >
          <div style={{ position: "absolute", top: "5px" }}>
            <a href="../">
              <CoCalcLogo base_url={this.props.base_url} /> Shared
            </a>
          </div>
          <CoCalcLink base_url={this.props.base_url} viewer="embed" />
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

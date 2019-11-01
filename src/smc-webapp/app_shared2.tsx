import * as React from "react";
import { Rendered } from "./app-framework";
const { SiteName } = require("./customize");

const cocalc_logo_white = require("!url-loader?mimetype=image/svg+xml!cocalc-icon-white-transparent.svg");

export class KioskModeBanner extends React.Component<{}, {}> {
  render(): Rendered {
    return (
      <div id={"smc-startup-banner"}>
        <div>
          <img src={cocalc_logo_white} />
        </div>
        <div className={"message ready"}>
          <SiteName /> is ready.
        </div>
      </div>
    );
  }
}

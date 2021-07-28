/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "../app-framework";
import { Settings } from "smc-hub/share/settings";
import { A } from "../r_misc";

interface Props {
  base_path: string;
  viewer?: string;
  settings: Settings;
}

export class CoCalcLink extends Component<Props> {
  private target(): string {
    return `https://${this.props.settings.dns}${this.props.base_path}`;
  }

  private link(text: string): Rendered {
    return <A href={this.target()}>{text}</A>;
  }

  public render(): Rendered {
    if (this.props.viewer === "embed") {
      return (
        <div
          style={{
            right: "5px",
            top: "5px",
            position: "absolute",
            fontSize: "8pt",
            border: "1px solid #aaa",
            padding: "2px",
            zIndex: 1000,
          }}
        >
          {this.link(`Powered by ${this.props.settings.site_name}`)}
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
          }}
        >
          {this.link(this.props.settings.site_name)}
        </div>
      );
    }
  }
}

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { get_blob_url } from "../server-urls";
import { OUT_STYLE } from "./style";

interface PDFProps {
  project_id: string;
  value: string | Map<string, any>;
}

export class PDF extends Component<PDFProps> {
  render(): Rendered {
    let href: string;
    if (typeof this.props.value == "string") {
      href = get_blob_url(this.props.project_id, "pdf", this.props.value);
    } else {
      href = `data:application/pdf;base64,${this.props.value.get("value")}`;
    }
    return (
      <div style={OUT_STYLE}>
        <a
          href={href}
          target="_blank"
          style={{ cursor: "pointer" }}
          rel="noopener"
        >
          View PDF
        </a>
      </div>
    );
  }
}

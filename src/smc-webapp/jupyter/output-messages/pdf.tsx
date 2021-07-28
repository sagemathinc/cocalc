/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { get_blob_url } from "../server-urls";
import { OUT_STYLE } from "./style";

interface PDFProps {
  project_id: string;
  value: string | Map<string, any>;
}

export const PDF: React.FC<PDFProps> = (props: PDFProps) => {
  const { project_id, value } = props;

  function href(): string {
    if (typeof value == "string") {
      return get_blob_url(project_id, "pdf", value);
    } else {
      return `data:application/pdf;base64,${value.get("value")}`;
    }
  }

  return (
    <div style={OUT_STYLE}>
      <a
        href={href()}
        target="_blank"
        style={{ cursor: "pointer" }}
        rel="noopener"
      >
        View PDF
      </a>
    </div>
  );
};

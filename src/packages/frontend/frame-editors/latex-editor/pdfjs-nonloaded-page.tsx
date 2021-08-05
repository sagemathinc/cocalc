/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PDFPageProxy } from "pdfjs-dist";
import { React } from "../../app-framework";

interface Props {
  page: PDFPageProxy;
  scale: number;
}

export const NonloadedPage = React.memo((props: Props) => {
  const { page, scale } = props;
  const viewport = page.getViewport({ scale });
  const width = viewport.width + "px";
  const height = viewport.height + "px";
  return (
    <div
      style={{
        margin: "auto",
        background: "white",
        position: "relative",
        display: "inline-block",
      }}
    >
      <div style={{ width: width, height: height }} />
    </div>
  );
});
